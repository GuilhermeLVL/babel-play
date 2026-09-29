/**
 * BANCADA DE TRANSCRIÇÃO — WER/CER com IC de 95%, RTF, latência e custo, por sistema × conjunto.
 *
 * Sistemas (`--sistemas`, separados por vírgula):
 *   groq:whisper-large-v3-turbo            o que a produção manda hoje (language + verbose_json)
 *   groq:whisper-large-v3-turbo+t0+seg     + temperature 0 + descarte por no_speech/compressão +
 *                                            filtrarAlucinacao: o pipeline de nuvem PROPOSTO
 *   groq:whisper-large-v3[+...]            o modelo grande, 2,8× mais caro
 *   local:tiny|base|small[:dtype]          transformers.js em Node, com as opções de decode do
 *                                            `whisperWorker.ts` e o filtro de alucinação (dtype
 *                                            padrão `hibrido` = encoder fp32 + decoder q4, o da produção)
 *   parakeet:v3-int8                       Parakeet TDT 0.6B v3 int8 (onnxruntime-node, `parakeet.mjs`)
 *   parakeet:tagarela-int8                 o mesmo com ajuste fino em pt-BR (só pt; ver a nota legal lá)
 *     (aceitam os mesmos extras `+vad`/`+vadNNN`/`+esp` dos locais; o filtro de alucinação é o mesmo)
 * Conjuntos (`--conjuntos`): fleurs_pt, fleurs_en, fleurs_pt_snr5, …, fleurs_en_opus24, sem_fala.
 *
 * No conjunto `sem_fala` a métrica é outra: TAXA DE ALUCINAÇÃO — a fração de trechos sem fala que
 * saíram com qualquer letra. É o número que diz se o usuário vai ver "Obrigado por assistir" na
 * legenda de uma música.
 *
 * O idioma é SEMPRE informado (a produção manda a dica): medir sem ela avaliaria a detecção de
 * idioma, que é outro problema com outra correção.
 *
 * Uso:
 *   node scripts/eval-fala/bancada/stt.mjs --sistemas groq:whisper-large-v3-turbo --conjuntos fleurs_pt,fleurs_en
 *   ... --limite 20   (iterar rápido)   ... --refazer (ignora o cache)
 */
/* global FormData, Blob, AbortSignal */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

import { bootstrap, bootstrapPareado, razaoEm } from '../../../src/core/eval/bootstrap.ts'
import { cer, wer } from '../../../src/core/eval/wer.ts'
import { filtrarAlucinacao } from '../../../src/gateway/alucinacao.ts'
import { ehPrefixo, EspelhoDoVad } from '../../../src/gateway/capture/espelhoDoVad.ts'
import {
  BANCADA_DIR,
  cache,
  chave,
  comAmostra,
  comRetentativa,
  CotaDoProvedor,
  respeitarRitmo,
  gastoTotal,
  gravarResultado,
  lerJsonl,
  lerWav,
  opt,
  percentis,
  registrarGasto,
  TetoDeGasto,
} from './comum.mjs'
import { carregarParakeet, transcreverParakeet } from './parakeet.mjs'

/** US$ por hora, com o mínimo de 10 s por requisição — console.groq.com/docs/speech-to-text (24/09/2026). */
const PRECO_HORA = { 'whisper-large-v3-turbo': 0.04, 'whisper-large-v3': 0.111 }

const SISTEMAS = opt('sistemas', 'groq:whisper-large-v3-turbo')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
const CONJUNTOS = opt('conjuntos', 'fleurs_pt,fleurs_en')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
const LIMITE = Number(opt('limite', '0')) || 0

function interpretar(s) {
  const [tipo, resto] = s.split(':')
  const [modelo, ...extras] = resto.split('+')
  const [nome, dtype] = modelo.split('@')
  return {
    id: s,
    tipo,
    modelo: nome,
    dtype: dtype || 'hibrido',
    t0: extras.includes('t0'),
    seg: extras.includes('seg'),
    vad: extras.some((e) => e.startsWith('vad')),
    redencaoMs: Number((extras.find((e) => /^vad\d+$/.test(e)) ?? 'vad450').slice(3)),
    // `+esp`: o final é a janela do FINAL ESPECULATIVO da produção (ver `espelhoDoVad.ts`): o trecho
    // que o VAD fecha, sem os quadros de silêncio depois de ~450 ms. Mede se isso muda o WER.
    esp: extras.includes('esp'),
  }
}

// ------------------------------------------------------------------ VAD (o portão da produção)
/**
 * `+vad`: passa o áudio pelo MESMO Silero legacy e pelo MESMO FrameProcessor do `@ricky0123/vad-web`
 * que o navegador usa, com os limiares de `systemAudio.ts` (0,5 / 0,35, redenção 450 ms, pré-fala
 * 300 ms, fala mínima 400 ms), e transcreve só os trechos que ele libera. Sem isto, a taxa de
 * alucinação mede um Whisper que o usuário nunca vê cru.
 */
const exigir = createRequire(import.meta.url)
let vadPronto = null
async function segmentosDeFala(pcm, redencaoMs = 450, especulativo = false) {
  if (!vadPronto) {
    const ort = exigir('onnxruntime-node')
    const { SileroLegacy } = exigir('@ricky0123/vad-web/dist/models/legacy.js')
    const { FrameProcessor } = exigir('@ricky0123/vad-web/dist/frame-processor.js')
    const modelo = await SileroLegacy.new(ort, async () => readFileSync('public/silero_vad_legacy.onnx'))
    vadPronto = { modelo, FrameProcessor }
  }
  const { modelo, FrameProcessor } = vadPronto
  modelo.reset_state()
  const fp = new FrameProcessor(
    modelo.process,
    modelo.reset_state,
    {
      positiveSpeechThreshold: 0.5,
      negativeSpeechThreshold: 0.35,
      redemptionMs: redencaoMs,
      preSpeechPadMs: 300,
      minSpeechMs: 400,
      submitUserSpeechOnPause: true,
    },
    1536 / 16,
  )
  fp.resume()
  const segs = []
  // O mesmo espelho e os mesmos números de `systemAudio.ts` (ESPECULATIVO_MS = 450).
  const espelho = new EspelhoDoVad({
    positiveSpeechThreshold: 0.5,
    negativeSpeechThreshold: 0.35,
    redemptionMs: redencaoMs,
    preSpeechPadMs: 300,
    especulativoMs: 450,
  })
  let janela = null
  const coletar = (ev) => {
    if (especulativo && ev.msg === 'FRAME_PROCESSED') {
      const e = espelho.quadro(ev.probs.isSpeech, ev.frame)
      if (e === 'especular') janela = espelho.janela()
      if (e === 'cancelar') janela = null
    }
    if (ev.audio && ev.msg === 'SPEECH_END') segs.push(janela && ehPrefixo(janela, ev.audio) ? janela : ev.audio)
    if (ev.msg === 'SPEECH_END' || ev.msg === 'VAD_MISFIRE') {
      espelho.reiniciar()
      janela = null
    }
  }
  for (let i = 0; i + 1536 <= pcm.length; i += 1536) await fp.process(pcm.subarray(i, i + 1536), coletar)
  fp.endSegment(coletar)
  return segs
}

// ------------------------------------------------------------------ nuvem
function montarWav(pcm) {
  const bytes = pcm.length * 2
  const buf = Buffer.alloc(44 + bytes)
  buf.write('RIFF', 0, 'ascii')
  buf.writeUInt32LE(36 + bytes, 4)
  buf.write('WAVE', 8, 'ascii')
  buf.write('fmt ', 12, 'ascii')
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20)
  buf.writeUInt16LE(1, 22)
  buf.writeUInt32LE(16000, 24)
  buf.writeUInt32LE(32000, 28)
  buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36, 'ascii')
  buf.writeUInt32LE(bytes, 40)
  for (let i = 0; i < pcm.length; i++)
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, pcm[i])) * 32767), 44 + i * 2)
  return buf
}

/**
 * Descarte por segmento — a proposta da Fase B para `sttProxy.ts`, com os limiares do
 * faster-whisper (no_speech 0,6 com logprob < −1; compression_ratio > 2,4 = laço de repetição).
 */
function textoDosSegmentos(json) {
  if (!Array.isArray(json.segments)) return (json.text ?? '').trim()
  const bons = json.segments.filter(
    (s) => !((s.no_speech_prob > 0.6 && s.avg_logprob < -1) || s.compression_ratio > 2.4),
  )
  return bons
    .map((s) => s.text)
    .join('')
    .trim()
}

async function transcreverNuvem(sis, pcm, idioma) {
  const k = chave('GROQ_API_KEY')
  await respeitarRitmo('STT', 19)
  const r = await comRetentativa(() => {
    const fd = new FormData()
    fd.append('file', new Blob([montarWav(pcm)], { type: 'audio/wav' }), 'audio.wav')
    fd.append('model', sis.modelo)
    fd.append('language', idioma)
    fd.append('response_format', 'verbose_json')
    if (sis.t0) fd.append('temperature', '0')
    return fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${k}` },
      body: fd,
      signal: AbortSignal.timeout(60_000),
    })
  }, sis.id)
  const json = await r.json()
  const ms = r.ms
  const dur = pcm.length / 16000
  registrarGasto(sis.id, (Math.max(10, dur) / 3600) * (PRECO_HORA[sis.modelo] ?? 0.111))
  let texto = sis.seg ? textoDosSegmentos(json) : (json.text ?? '').trim()
  if (sis.seg) texto = filtrarAlucinacao(texto, dur, idioma)
  return { texto, ms }
}

// ------------------------------------------------------------------ local
let asrCarregado = null
async function asrLocal(sis) {
  if (asrCarregado?.id === sis.id) return asrCarregado.asr
  const { pipeline, env } = await import('@huggingface/transformers')
  env.allowLocalModels = false
  const dtype = sis.dtype === 'hibrido' ? { encoder_model: 'fp32', decoder_model_merged: 'q4' } : sis.dtype
  // Moonshine (só inglês, arXiv 2602.12241): o candidato a legenda local em en.
  const repo = sis.modelo.startsWith('moonshine')
    ? `onnx-community/${sis.modelo}-ONNX`
    : `onnx-community/whisper-${sis.modelo}`
  const asr = await pipeline('automatic-speech-recognition', repo, {
    dtype: sis.modelo.startsWith('moonshine') && sis.dtype === 'hibrido' ? 'fp32' : dtype,
    device: 'cpu',
  })
  asrCarregado = { id: sis.id, asr }
  return asr
}

async function transcreverLocal(sis, pcm, idioma) {
  const asr = await asrLocal(sis)
  const dur = pcm.length / 16000
  const t0 = performance.now()
  if (sis.modelo.startsWith('moonshine')) {
    const out = await asr(pcm, { max_new_tokens: Math.max(8, Math.round(dur * 15)) })
    return { texto: filtrarAlucinacao((out.text ?? '').trim(), dur, idioma), ms: performance.now() - t0 }
  }
  // Espelho de whisperWorker.ts (greedy, travas anti-repetição, teto de tokens por duração).
  const out = await asr(pcm, {
    language: idioma,
    task: 'transcribe',
    return_timestamps: false,
    num_beams: 1,
    do_sample: false,
    max_new_tokens: Math.max(8, Math.min(idioma === 'en' ? 128 : 160, Math.round(dur * (idioma === 'en' ? 15 : 22)))),
    no_repeat_ngram_size: 3,
    repetition_penalty: 1.15,
  })
  const ms = performance.now() - t0
  return { texto: filtrarAlucinacao((out.text ?? '').trim(), dur, idioma), ms }
}

/**
 * Parakeet: sem dica de idioma (o v3 detecta sozinho) e sem travas de decodificação a espelhar — a
 * TDT gulosa não entra em laço de repetição como o Whisper. O filtro de alucinação é o MESMO dos
 * outros locais, para o WER e a taxa de alucinação serem comparáveis.
 */
async function transcreverParakeetBancada(sis, pcm, idioma) {
  await carregarParakeet(sis.modelo) // download e carga FORA do cronômetro, como em `asrLocal`
  const dur = pcm.length / 16000
  const t0 = performance.now()
  const texto = await transcreverParakeet(sis.modelo, pcm)
  const ms = performance.now() - t0
  return { texto: filtrarAlucinacao(texto.trim(), dur, idioma), ms }
}

// ------------------------------------------------------------------ execução
async function rodar(sis, spec) {
  const { nome: conjunto, n } = comAmostra(spec)
  const semFala = conjunto === 'sem_fala'
  let itens = lerJsonl(semFala ? 'sem_fala.jsonl' : `stt/${conjunto}.jsonl`)
  if (n || LIMITE) itens = itens.slice(0, n || LIMITE)
  const idiomaDoConjunto = semFala ? 'pt' : itens[0].idioma
  const c = cache(`stt_${sis.id}_${conjunto}`)
  const casos = []
  for (let i = 0; i < itens.length; i++) {
    const it = itens[i]
    let r = c.get(it.id)
    if (!r) {
      const pcm = lerWav(readFileSync(path.join(BANCADA_DIR, it.arquivo)))
      const um = (x) =>
        sis.tipo === 'groq'
          ? transcreverNuvem(sis, x, idiomaDoConjunto)
          : sis.tipo === 'parakeet'
            ? transcreverParakeetBancada(sis, x, idiomaDoConjunto)
            : transcreverLocal(sis, x, idiomaDoConjunto)
      if (sis.vad) {
        const partes = []
        let ms = 0
        const segs = await segmentosDeFala(pcm, sis.redencaoMs, sis.esp)
        for (const seg of segs) {
          const p = await um(seg)
          partes.push(p.texto)
          ms += p.ms
        }
        r = { texto: partes.filter(Boolean).join(' '), ms, segmentos: segs.length }
      } else r = await um(pcm)
      r.duracaoS = pcm.length / 16000
      c.set(it.id, r)
    }
    casos.push({ ...it, hipotese: r.texto, ms: r.ms, duracaoS: r.duracaoS })
    process.stdout.write(`\r  ${sis.id} × ${conjunto}: ${i + 1}/${itens.length}   `)
  }
  c.salvar()
  const audioS = casos.reduce((s, x) => s + x.duracaoS, 0)
  const rtf = casos.reduce((s, x) => s + x.ms, 0) / 1000 / audioS
  const [p50, p95] = percentis(casos.map((x) => x.ms))
  const custoHora =
    sis.tipo === 'groq'
      ? (casos.reduce((s, x) => s + Math.max(10, x.duracaoS), 0) / audioS) * (PRECO_HORA[sis.modelo] ?? 0.111)
      : 0
  if (semFala) {
    const alucinou = casos.map((x) => (/\p{L}/u.test(x.hipotese) ? 1 : 0))
    const taxa = bootstrap(casos.length, (idx) => idx.reduce((s, i) => s + alucinou[i], 0) / idx.length)
    const exemplos = [...new Set(casos.filter((x) => /\p{L}/u.test(x.hipotese)).map((x) => x.hipotese))].slice(0, 12)
    console.log(
      `\r  ${sis.id} × sem_fala: alucinação ${(taxa.valor * 100).toFixed(1)}% [${(taxa.ic95[0] * 100).toFixed(1)}–${(taxa.ic95[1] * 100).toFixed(1)}]`,
    )
    return {
      sistema: sis.id,
      conjunto,
      n: casos.length,
      taxaDeAlucinacao: taxa,
      exemplos,
      rtf,
      latenciaMs: { p50, p95 },
      casos: casos.map(({ id, categoria, hipotese }) => ({ id, categoria, hipotese })),
    }
  }
  const erros = casos.map((x) => wer(x.referencia, x.hipotese))
  const errosC = casos.map((x) => cer(x.referencia, x.hipotese))
  const w = bootstrap(
    casos.length,
    razaoEm(
      erros.map((e) => e.distancia),
      erros.map((e) => e.unidadesNaReferencia),
    ),
  )
  const cc = bootstrap(
    casos.length,
    razaoEm(
      errosC.map((e) => e.distancia),
      errosC.map((e) => e.unidadesNaReferencia),
    ),
  )
  console.log(
    `\r  ${sis.id} × ${conjunto}: WER ${(w.valor * 100).toFixed(1)}% [${(w.ic95[0] * 100).toFixed(1)}–${(w.ic95[1] * 100).toFixed(1)}]  CER ${(cc.valor * 100).toFixed(1)}%  RTF ${rtf.toFixed(3)}  p50 ${p50.toFixed(0)} ms  p95 ${p95.toFixed(0)} ms`,
  )
  return {
    sistema: sis.id,
    conjunto,
    n: casos.length,
    wer: w,
    cer: cc,
    rtf,
    latenciaMs: { p50, p95 },
    custoUsdPorHora: custoHora,
    casos: casos.map((x, i) => ({
      id: x.id,
      referencia: x.referencia,
      hipotese: x.hipotese,
      erros: erros[i].distancia,
      palavras: erros[i].unidadesNaReferencia,
      ms: Math.round(x.ms),
    })),
  }
}

async function main() {
  const resultados = []
  try {
    for (const s of SISTEMAS) {
      const sis = interpretar(s)
      for (const conj of CONJUNTOS) resultados.push(await rodar(sis, conj))
    }
  } catch (e) {
    if (!(e instanceof TetoDeGasto || e instanceof CotaDoProvedor)) throw e
    console.error(`\n${e.message} — resultados parciais gravados.`)
  }

  // Comparações pareadas contra o PRIMEIRO sistema, no mesmo conjunto e nos mesmos casos.
  const comparacoes = []
  for (const conj of CONJUNTOS.map((c) => comAmostra(c).nome).filter((c) => c !== 'sem_fala')) {
    const doConj = resultados.filter((r) => r.conjunto === conj)
    const base = doConj[0]
    for (const outro of doConj.slice(1)) {
      const ids = base.casos.map((x) => x.id)
      const mapa = new Map(outro.casos.map((x) => [x.id, x]))
      if (!ids.every((id) => mapa.has(id))) continue
      const b = base.casos,
        o = ids.map((id) => mapa.get(id))
      const d = bootstrapPareado(
        ids.length,
        razaoEm(
          o.map((x) => x.erros),
          o.map((x) => x.palavras),
        ),
        razaoEm(
          b.map((x) => x.erros),
          b.map((x) => x.palavras),
        ),
      )
      comparacoes.push({ conjunto: conj, sistema: outro.sistema, contra: base.sistema, diferencaWer: d })
      console.log(
        `  Δ WER ${conj}: ${outro.sistema} − ${base.sistema} = ${(d.valor * 100).toFixed(2)} pts [${(d.ic95[0] * 100).toFixed(2)}, ${(d.ic95[1] * 100).toFixed(2)}]${d.significativo ? ' *significativo*' : ' (empate)'}`,
      )
    }
  }
  const nome = `stt_${SISTEMAS.map((s) => s.replace(/[^a-z0-9]+/gi, '-')).join('_')}_${CONJUNTOS.join('-')}`.slice(
    0,
    150,
  )
  const saida = gravarResultado(nome, {
    sistemas: SISTEMAS,
    conjuntos: CONJUNTOS,
    gastoTotalUsd: gastoTotal(),
    resultados,
    comparacoes,
  })
  console.log(`\ngasto acumulado da bancada: US$ ${gastoTotal().toFixed(4)}\nbruto: ${saida}`)
}

main().catch((e) => {
  console.error('FALHOU:', e.message)
  process.exit(1)
})
