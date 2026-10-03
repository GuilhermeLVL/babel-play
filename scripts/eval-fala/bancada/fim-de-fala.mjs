/**
 * BANCADA DO FIM DE FALA INTELIGENTE — o modelo de turno (Smart Turn v3) acerta "a frase acabou"? E o que
 * isso muda no fechamento da fala, medido com o MESMO VAD e o MESMO espelho do navegador?
 *
 * Duas medidas, sobre as falas lidas do FLEURS que `baixar-fim-de-fala.py` guarda em
 * `BANCADA_DIR/fimdefala/` (pt, en, es, zh, ja):
 *
 *  A. O MODELO SOZINHO. Para cada fala: (a) a fala COMPLETA + 300 ms de silêncio → o modelo deve dizer "completa";
 *     (b) a MESMA fala cortada no meio, numa queda de energia (fronteira de palavra: o menor trecho de
 *     energia perto de 35% e de 70% da fala) + 300 ms de silêncio → deve dizer "incompleta". Acurácia por
 *     limiar, % de falsos "completa" (o erro que PARTE a frase), % de falsos "incompleta" (só perde o ganho: a
 *     fala fecha em 800 ms como hoje), AUC e tempo por consulta. O silêncio de 300 ms é ruído gaussiano no nível
 *     de ruído da própria gravação (o que o VAD veria numa pausa de verdade).
 *
 *  B. O FECHAMENTO DE PONTA A PONTA, sem STT. O Silero + FrameProcessor de `@ricky0123/vad-web` (limiares de
 *     `systemAudio.ts`) rodam sobre cada fala em três condições — natural, com uma pausa de 500 ms e com uma de
 *     700 ms no meio (pausa para pensar) — de duas formas: silêncio FIXO de 800 ms (o de hoje) e INTELIGENTE
 *     (o espelho avisa o silêncio candidato = o piso, o modelo é consultado com os últimos 8 s, `p >= limiar`
 *     fecha com `pause()`/`resume()` como o corte forçado, senão espera o teto). Mede fragmentos por fala,
 *     o silêncio esperado depois da última palavra (p50/p95), e o custo de nuvem (a Groq cobra no mínimo 10 s
 *     por pedido: Σ max(10 s, trecho)) em razão do silêncio fixo. IC de 95% por bootstrap PAREADO.
 *
 * Não mede WER: não há STT neste script (o WER do silêncio fixo contra o inteligente é outra rodada, com
 * `stt.mjs`). Por isso o relatório diz o que foi medido e o que não foi.
 *
 * Uso:
 *   node node_modules/tsx/dist/cli.mjs scripts/eval-fala/bancada/fim-de-fala.mjs
 *        [--idiomas pt,en,es,zh,ja] [--limite 100] [--limiares 0.3,0.5,0.7,0.8,0.9] [--limiar 0.7]
 *        [--teto 800] [--latencia 100] [--sem-b]
 *   --teto: silêncio máximo do inteligente em ms (o do app é 800; a bancada aceita até 2500).
 *   --latencia: ms entre a consulta e o fechamento (ida e volta ao worker); o fechamento espera esse tanto.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

import { bootstrap, mediaEm, rngComSemente } from '../../../src/core/eval/bootstrap.ts'
import { EspelhoDoVad } from '../../../src/gateway/capture/espelhoDoVad.ts'
import { featuresDoSmartTurn } from '../../../src/gateway/capture/melDoSmartTurn.ts'
import { criarPisoDoSilencio } from '../../../src/gateway/capture/pisoDoSilencio.ts'
import { BANCADA_DIR, gravarResultado, hash, lerJsonl, lerWav, opt, percentis, flag } from './comum.mjs'
import path from 'node:path'

const exigir = createRequire(import.meta.url)

const IDIOMAS = opt('idiomas', 'pt,en,es,zh,ja')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
const LIMITE = Number(opt('limite', '100'))
const LIMIARES = opt('limiares', '0.3,0.5,0.7,0.8,0.9').split(',').map(Number)
const LIMIAR = Number(opt('limiar', '0.9'))
const TETO_MS = Number(opt('teto', '800'))
const LATENCIA_MS = Number(opt('latencia', '100'))
const SEM_B = flag('sem-b')
const MODELO = 'public/smart-turn/smart-turn-v3.2-cpu.onnx'

const QUADRO = 1536 // amostras por quadro do Silero a 16 kHz (96 ms)
const MS_QUADRO = QUADRO / 16
const CAUDA_MS = 300

// ------------------------------------------------------------------ ruído e energia
function ruidoGaussiano(n, rms, semente) {
  const rng = rngComSemente(Number.parseInt(hash(semente).slice(0, 8), 16))
  const out = new Float32Array(n)
  for (let i = 0; i < n; i += 2) {
    const u = Math.max(1e-12, rng())
    const v = rng()
    const r = Math.sqrt(-2 * Math.log(u)) * rms
    out[i] = r * Math.cos(2 * Math.PI * v)
    if (i + 1 < n) out[i + 1] = r * Math.sin(2 * Math.PI * v)
  }
  return out
}

/** RMS por janela de 20 ms com passo de 10 ms. */
function energia(pcm) {
  const j = 320
  const h = 160
  const out = []
  for (let i = 0; i + j <= pcm.length; i += h) {
    let s = 0
    for (let k = 0; k < j; k++) s += pcm[i + k] * pcm[i + k]
    out.push(Math.sqrt(s / j))
  }
  return out
}

function concatenar(...partes) {
  const out = new Float32Array(partes.reduce((s, p) => s + p.length, 0))
  let o = 0
  for (const p of partes) {
    out.set(p, o)
    o += p.length
  }
  return out
}

// ------------------------------------------------------------------ VAD (o da produção) e modelo de turno
let vadPronto = null
async function vad() {
  if (!vadPronto) {
    const ort = exigir('onnxruntime-node')
    const { SileroLegacy } = exigir('@ricky0123/vad-web/dist/models/legacy.js')
    const { FrameProcessor } = exigir('@ricky0123/vad-web/dist/frame-processor.js')
    const modelo = await SileroLegacy.new(ort, async () => readFileSync('public/silero_vad_legacy.onnx'))
    vadPronto = { modelo, FrameProcessor }
  }
  return vadPronto
}

let turno = null
async function modeloDeTurno() {
  if (!turno) {
    const ort = exigir('onnxruntime-node')
    const sessao = await ort.InferenceSession.create(MODELO, { intraOpNumThreads: 1, interOpNumThreads: 1 })
    turno = { ort, sessao }
  }
  return turno
}

const temposMel = []
const temposInferencia = []
/** Probabilidade de "completa" sobre o áudio (últimos 8 s). A saída do modelo JÁ é probabilidade. */
async function probabilidade(pcm) {
  const { ort, sessao } = await modeloDeTurno()
  const t0 = performance.now()
  const f = featuresDoSmartTurn(pcm)
  const t1 = performance.now()
  const out = await sessao.run({ input_features: new ort.Tensor('float32', f, [1, 80, 800]) })
  const t2 = performance.now()
  temposMel.push(t1 - t0)
  temposInferencia.push(t2 - t1)
  return out[sessao.outputNames[0]].data[0]
}

/** Probabilidades do Silero por quadro (para achar onde há fala). */
async function probsDoVad(pcm) {
  const { modelo } = await vad()
  modelo.reset_state()
  const probs = []
  for (let i = 0; i + QUADRO <= pcm.length; i += QUADRO)
    probs.push((await modelo.process(pcm.subarray(i, i + QUADRO))).isSpeech)
  return probs
}

// ------------------------------------------------------------------ preparo de cada fala
/** O que cada fala tem de útil: onde a fala começa e termina, o nível de ruído e as quedas internas de energia. */
async function analisar(pcm, id) {
  const probs = await probsDoVad(pcm)
  const falando = probs.map((p, i) => (p >= 0.5 ? i : -1)).filter((i) => i >= 0)
  if (falando.length < 5) return null
  const inicio = falando[0] * QUADRO
  const fim = Math.min(pcm.length, (falando.at(-1) + 1) * QUADRO)
  const en = energia(pcm)
  const ord = [...en].sort((a, b) => a - b)
  const piso = Math.max(3e-4, ord[Math.floor(ord.length * 0.1)])
  const noMeio = en.slice(Math.floor(inicio / 160), Math.floor(fim / 160)).sort((a, b) => a - b)
  const mediana = noMeio[Math.floor(noMeio.length / 2)] || 1e-3
  // Menor energia (janela de 30 ms) perto de cada fração da fala: é a fronteira de palavra mais clara.
  const suave = en.map((_, i) => {
    const a = Math.max(0, i - 1)
    const b = Math.min(en.length - 1, i + 1)
    return (en[a] + en[i] + en[b]) / 3
  })
  const quedas = [0.35, 0.7].map((frac) => {
    const span = fim - inicio
    const centro = inicio + frac * span
    const a = Math.max(Math.floor((inicio + 0.15 * span) / 160), Math.floor((centro - 0.12 * span) / 160))
    const b = Math.min(Math.floor((fim - 0.1 * span) / 160), Math.floor((centro + 0.12 * span) / 160))
    let melhor = a
    for (let i = a; i <= b; i++) if (suave[i] < suave[melhor]) melhor = i
    // O corte vai ao centro da janela de 20 ms: a amostra em que a energia é mínima.
    return { amostra: melhor * 160 + 160, relativo: suave[melhor] / mediana }
  })
  // PAUSAS NATURAIS: silêncio de dentro da fala (>= 3 quadros do Silero abaixo de 0,35 e fala depois): onde o
  // app consultaria o modelo de verdade. A amostra é o ponto da consulta (3 quadros = 288 ms de silêncio real).
  const pausas = []
  let corrida = 0
  for (let q = falando[0]; q <= falando.at(-1); q++) {
    if (probs[q] < 0.35) corrida++
    else {
      if (corrida >= 3 && probs[q] >= 0.5) pausas.push((q - corrida + 3) * QUADRO)
      corrida = 0
    }
  }
  return { id, pcm, inicio, fim, piso, quedas, pausas }
}

// ------------------------------------------------------------------ A. o modelo sozinho
/** Prefixo de áudio + 300 ms de ruído do nível da gravação (o silêncio candidato). */
const comCauda = (pcm, ate, a) =>
  concatenar(pcm.subarray(0, ate), ruidoGaussiano((CAUDA_MS * 16) | 0, a.piso, `${a.id}-cauda`))

async function medirModelo(analises) {
  const casos = []
  for (const a of analises) {
    casos.push({
      id: a.id,
      verdade: 1,
      p: await probabilidade(comCauda(a.pcm, a.fim, a)),
      clara: true,
      tipo: 'completa',
    })
    for (const [k, amostra] of a.pausas.entries())
      casos.push({
        id: `${a.id}~${k}`,
        verdade: 0,
        p: await probabilidade(a.pcm.subarray(0, amostra)),
        clara: true,
        tipo: 'pausa',
      })
    for (const [k, q] of a.quedas.entries()) {
      // `clara`: a queda tem menos de 25% da energia mediana da fala — uma fronteira de palavra de verdade, não
      // um corte no meio de uma vogal. Os números principais usam só estes.
      casos.push({
        id: `${a.id}#${k}`,
        verdade: 0,
        p: await probabilidade(comCauda(a.pcm, q.amostra, a)),
        clara: q.relativo <= 0.25,
        tipo: 'corte',
      })
    }
  }
  return casos
}

function auc(casos) {
  const pos = casos.filter((c) => c.verdade === 1).map((c) => c.p)
  const neg = casos.filter((c) => c.verdade === 0).map((c) => c.p)
  if (!pos.length || !neg.length) return NaN
  let ganho = 0
  for (const p of pos) for (const n of neg) ganho += p > n ? 1 : p === n ? 0.5 : 0
  return ganho / (pos.length * neg.length)
}

function resumoDoModelo(casos, tipoIncompleta) {
  const uteis = casos.filter((c) => c.verdade === 1 || (c.tipo === tipoIncompleta && c.clara))
  const comp = uteis.filter((c) => c.verdade === 1)
  const inc = uteis.filter((c) => c.verdade === 0)
  const porLimiar = LIMIARES.map((th) => {
    const falsaCompleta = bootstrap(inc.length, mediaEm(inc.map((c) => (c.p >= th ? 1 : 0))))
    const recall = bootstrap(comp.length, mediaEm(comp.map((c) => (c.p >= th ? 1 : 0))))
    const acertos = uteis.map((c) => (c.p >= th === (c.verdade === 1) ? 1 : 0))
    const acuracia = bootstrap(uteis.length, mediaEm(acertos))
    return { limiar: th, acuracia, falsaCompleta, completaReconhecida: recall }
  })
  return {
    completas: comp.length,
    incompletasEmFronteiraClara: inc.length,
    incompletasTotal: casos.filter((c) => c.tipo === tipoIncompleta).length,
    auc: auc(uteis),
    porLimiar,
  }
}

// ------------------------------------------------------------------ B. fechamento de ponta a ponta
/** A fala em uma condição: natural, ou com uma pausa de `pausaMs` inserida na primeira queda de energia. */
function montarCondicao(a, pausaMs) {
  const cabeca = ruidoGaussiano(8000, a.piso, `${a.id}-cabeca`)
  const cauda = ruidoGaussiano(16000 * 3, a.piso, `${a.id}-final`)
  if (!pausaMs) return { pcm: concatenar(cabeca, a.pcm, cauda), fimDaFala: cabeca.length + a.fim }
  const corte = a.quedas[0].amostra
  const pausa = ruidoGaussiano((pausaMs * 16) | 0, a.piso, `${a.id}-pausa${pausaMs}`)
  return {
    pcm: concatenar(cabeca, a.pcm.subarray(0, corte), pausa, a.pcm.subarray(corte), cauda),
    fimDaFala: cabeca.length + a.fim + pausa.length,
  }
}

/** Roda o VAD de verdade (fixo) ou com o fim inteligente. Devolve os trechos e quando o último fechou. */
async function fechar(pcm, fimDaFala, inteligente) {
  const { modelo, FrameProcessor } = await vad()
  modelo.reset_state()
  const opcoesDoVad = {
    positiveSpeechThreshold: 0.5,
    negativeSpeechThreshold: 0.35,
    redemptionMs: TETO_MS,
    preSpeechPadMs: 300,
    minSpeechMs: 400,
    submitUserSpeechOnPause: true,
  }
  const fp = new FrameProcessor(modelo.process, modelo.reset_state, opcoesDoVad, MS_QUADRO)
  fp.resume()
  const piso = criarPisoDoSilencio()
  let consultaPendente = false
  const espelho = new EspelhoDoVad({
    positiveSpeechThreshold: 0.5,
    negativeSpeechThreshold: 0.35,
    redemptionMs: TETO_MS,
    preSpeechPadMs: 300,
    especulativoMs: 450,
    ...(inteligente
      ? {
          consultaMs: () => piso.valor(),
          aoConsultar: () => {
            consultaPendente = true
          },
          aoVoltarDaPausa: (ms) => piso.registrarPausa(ms),
        }
      : {}),
  })
  const trechos = []
  let i = 0
  let fecharEm = -1
  const tratar = (ev) => {
    if (ev.msg === 'FRAME_PROCESSED') espelho.quadro(ev.probs.isSpeech, ev.frame)
    if (ev.msg === 'SPEECH_END') trechos.push({ n: ev.audio.length, fechouEm: i })
    if (ev.msg === 'SPEECH_END' || ev.msg === 'VAD_MISFIRE') espelho.reiniciar()
  }
  for (i = 0; (i + 1) * QUADRO <= pcm.length; i++) {
    await fp.process(pcm.subarray(i * QUADRO, (i + 1) * QUADRO), tratar)
    if (!inteligente) continue
    if (fecharEm === i) {
      fecharEm = -1
      // Só fecha se o silêncio continua (a pessoa pode ter voltado enquanto o modelo respondia).
      if (espelho.silencioMs > 0) {
        fp.pause(tratar)
        fp.resume()
      }
    }
    if (consultaPendente) {
      consultaPendente = false
      const p = await probabilidade(espelho.janela())
      if (p >= LIMIAR) fecharEm = i + Math.max(1, Math.ceil(LATENCIA_MS / MS_QUADRO))
    }
  }
  fp.pause(tratar) // o que sobrar aberto no fim do áudio
  const ultimo = trechos.at(-1)
  return {
    trechos,
    // Silêncio esperado depois da última palavra: do fim da fala até o quadro em que o último trecho fechou.
    esperaMs: ultimo ? Math.max(0, (ultimo.fechouEm + 1) * MS_QUADRO - fimDaFala / 16) : NaN,
  }
}

const custoDeNuvem = (trechos) => trechos.reduce((s, t) => s + Math.max(10, t.n / 16000), 0)

async function medirFechamento(analises) {
  const condicoes = [
    { nome: 'natural', pausaMs: 0 },
    { nome: 'pausa500', pausaMs: 500 },
    { nome: 'pausa700', pausaMs: 700 },
  ]
  const saida = {}
  for (const c of condicoes) {
    const linhas = []
    for (const a of analises) {
      const { pcm, fimDaFala } = montarCondicao(a, c.pausaMs)
      const fixo = await fechar(pcm, fimDaFala, false)
      const intel = await fechar(pcm, fimDaFala, true)
      if (!fixo.trechos.length || !intel.trechos.length) continue
      linhas.push({
        fragFixo: fixo.trechos.length,
        fragInt: intel.trechos.length,
        esperaFixo: fixo.esperaMs,
        esperaInt: intel.esperaMs,
        custoFixo: custoDeNuvem(fixo.trechos),
        custoInt: custoDeNuvem(intel.trechos),
      })
    }
    const n = linhas.length
    const col = (k) => linhas.map((l) => l[k])
    const dif = (a, b) => linhas.map((l) => l[a] - l[b])
    saida[c.nome] = {
      falas: n,
      fragmentosPorFala: {
        fixo: bootstrap(n, mediaEm(col('fragFixo'))),
        inteligente: bootstrap(n, mediaEm(col('fragInt'))),
        diferencaIntMenosFixo: bootstrap(n, mediaEm(dif('fragInt', 'fragFixo'))),
      },
      esperaAposUltimaPalavraMs: {
        fixoP50P95: percentis(col('esperaFixo')).map(Math.round),
        inteligenteP50P95: percentis(col('esperaInt')).map(Math.round),
        diferencaMediaIntMenosFixo: bootstrap(n, mediaEm(dif('esperaInt', 'esperaFixo'))),
      },
      custoDeNuvemRazao: bootstrap(n, (idx) => {
        let a = 0
        let b = 0
        for (const j of idx) {
          a += linhas[j].custoInt
          b += linhas[j].custoFixo
        }
        return a / b
      }),
    }
  }
  return saida
}

// ------------------------------------------------------------------ main
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : 'n/d')
const pc = (iv) => `${(iv.valor * 100).toFixed(1)}% [${(iv.ic95[0] * 100).toFixed(1)}–${(iv.ic95[1] * 100).toFixed(1)}]`

const relatorio = { modelo: MODELO, limiar: LIMIAR, tetoMs: TETO_MS, latenciaMs: LATENCIA_MS, idiomas: {} }
for (const idioma of IDIOMAS) {
  const falas = lerJsonl(`fimdefala/${idioma}.jsonl`).slice(0, LIMITE)
  const analises = []
  for (const m of falas) {
    const pcm = lerWav(readFileSync(path.join(BANCADA_DIR, m.arquivo)))
    const a = await analisar(pcm, m.id)
    if (a) analises.push(a)
  }
  console.log(`\n== ${idioma}: ${analises.length} falas analisadas`)
  const casos = await medirModelo(analises)
  const modelo = { corte: resumoDoModelo(casos, 'corte'), pausaNatural: resumoDoModelo(casos, 'pausa') }
  for (const [nome, r] of Object.entries(modelo)) {
    console.log(
      `   modelo/${nome}: AUC ${f2(r.auc)} | completas ${r.completas}, incompletas ${r.incompletasEmFronteiraClara}/${r.incompletasTotal}`,
    )
    for (const l of r.porLimiar)
      console.log(
        `     θ=${l.limiar}: acurácia ${pc(l.acuracia)} | falsos "completa" ${pc(l.falsaCompleta)} | completas reconhecidas ${pc(l.completaReconhecida)}`,
      )
  }
  relatorio.idiomas[idioma] = { falas: analises.length, modelo }
  if (!SEM_B) {
    const fechamento = await medirFechamento(analises)
    relatorio.idiomas[idioma].fechamento = fechamento
    for (const [nome, r] of Object.entries(fechamento))
      console.log(
        `   ${nome}: fragmentos/fala fixo ${f2(r.fragmentosPorFala.fixo.valor)} → inteligente ${f2(r.fragmentosPorFala.inteligente.valor)} (Δ ${f2(r.fragmentosPorFala.diferencaIntMenosFixo.valor)} [${f2(r.fragmentosPorFala.diferencaIntMenosFixo.ic95[0])}, ${f2(r.fragmentosPorFala.diferencaIntMenosFixo.ic95[1])}])` +
          ` | espera p50/p95 fixo ${r.esperaAposUltimaPalavraMs.fixoP50P95.join('/')} → int ${r.esperaAposUltimaPalavraMs.inteligenteP50P95.join('/')} ms` +
          ` | custo nuvem ${f2(r.custoDeNuvemRazao.valor)}× [${f2(r.custoDeNuvemRazao.ic95[0])}, ${f2(r.custoDeNuvemRazao.ic95[1])}]`,
      )
  }
}
const [melP50, melP95] = percentis(temposMel)
const [infP50, infP95] = percentis(temposInferencia)
relatorio.tempoPorConsultaMs = {
  consultas: temposInferencia.length,
  melP50,
  melP95,
  inferenciaP50: infP50,
  inferenciaP95: infP95,
}
console.log(
  `\nTempo por consulta (Node, 1 thread): mel p50 ${f2(melP50)} / p95 ${f2(melP95)} ms; modelo p50 ${f2(infP50)} / p95 ${f2(infP95)} ms (${temposInferencia.length} consultas)`,
)
console.log('gravado em', gravarResultado(opt('saida', 'fim-de-fala'), relatorio))
