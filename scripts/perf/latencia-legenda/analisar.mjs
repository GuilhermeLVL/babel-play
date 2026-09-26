#!/usr/bin/env node
/**
 * ANALISA as rodadas de `medir.mjs`: decompõe, fala a fala, o caminho "fim da fala → legenda".
 *
 *   node scripts/perf/latencia-legenda/analisar.mjs <rodada.json>... [--grupo NOME] [--json saida.json] [--pular N]
 *
 * Várias rodadas da MESMA configuração podem ser somadas (as falas viram uma amostra só).
 * `--pular N` descarta as N primeiras falas de cada rodada (aquecimento), para o regime estável.
 *
 * Marcos, todos em `performance.now()` da página (ms):
 *   E  = fim da voz no arquivo, convertido pelo bipe-âncora (sonda de áudio, janela de 20 ms)
 *   I  = início da voz no arquivo, idem
 *   Vf = VAD fechou o último trecho da fala (`capMetrics.tSpeechEnd`)
 *   P  = o decode FINAL foi postado ao worker de STT          R = resultado do decode final
 *   U  = 1º token do decode final (mensagem `update`)
 *   Do = o balão mostrou o texto FINAL (commit do React, MutationObserver; `tf` = quadro seguinte)
 *   Mp = pedido da tradução do texto final (worker opus-mt, Chrome Translator ou rede)
 *   Mr = tradução pronta                                       Dt = o balão mostrou a tradução
 * Métricas:
 *   vad         = Vf − E        (redemption de 800 ms + quadros do VAD)
 *   sttEspera   = parte de R − P em que o worker ainda terminava um PARCIAL da mesma fala
 *   stt         = R − P         (decode final, incluída a espera acima)
 *   renderOrig  = Do − R
 *   mtEspera    = Mp − R        (do resultado do STT ao pedido da tradução)
 *   mt          = Mr − Mp
 *   renderTrad  = Dt − Mr
 *   fimAoOriginal  = Do − E     fimATraducao = Dt − E     (ponta a ponta)
 *   inicioAoPrimeiroTexto = 1º parcial exibido − I
 *   traducaoAntesDoFim = a tradução de algum PARCIAL já estava na tela quando a voz acabou?
 */
import { readFileSync, writeFileSync } from 'node:fs'

const args = process.argv.slice(2)
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`)
  return i > -1 && args[i + 1] ? args[i + 1] : d
}
const arquivos = args.filter((a, i) => a.endsWith('.json') && args[i - 1] !== '--json')
const PULAR = Number(opt('pular', 0))

const norm = (s) =>
  String(s || '')
    .replace(/^≈\s*/, '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N} ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
const parecido = (a, b) => {
  const x = norm(a)
  const y = norm(b)
  if (!x || !y) return false
  if (x === y) return true
  const n = Math.min(24, x.length, y.length)
  return x.slice(0, n) === y.slice(0, n)
}

export function pct(xs, p) {
  const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b)
  if (!s.length) return null
  // interpolação linear (tipo 7): com n pequeno, p95 fica entre os dois maiores.
  const h = (s.length - 1) * (p / 100)
  const lo = Math.floor(h)
  return Math.round(s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (h - lo))
}

export function analisarRodada(d, pular = 0) {
  const ev = d.lat.ev
  const aud = d.lat.aud
  const dom = d.lat.dom
  const rot = d.roteiro
  // Âncora: 1ª janela de 20 ms dominada por 2 kHz. O bipe começou dentro dela → meio da janela.
  const jan = aud.find((a) => a[2] > 0.5 && a[1] > 0.01)
  if (!jan) return { erro: 'bipe não encontrado na sonda de áudio', falas: [] }
  const ancora = jan[0] - 10
  const tDoArquivo = (s) => ancora + (s - rot.bipeS) * 1000

  const sttOut = ev.filter((e) => e.k === 'w:out' && e.type === 'transcribe')
  const sttIn = new Map(
    ev
      .filter(
        (e) => e.k === 'w:in' && e.nome?.startsWith('whisperWorker') && (e.type === 'result' || e.type === 'error'),
      )
      .map((e) => [e.id, e]),
  )
  const sttUpd = ev.filter((e) => e.k === 'w:in' && e.type === 'update')
  const mtOut = ev.filter((e) => (e.k === 'w:out' && e.type === 'translate') || e.k === 'ct:out')
  const mtInPorId = new Map(
    ev
      .filter((e) => e.k === 'w:in' && e.nome?.startsWith('mtWorker') && (e.type === 'result' || e.type === 'error'))
      .map((e) => [e.id, e]),
  )
  const ctIn = ev.filter((e) => e.k === 'ct:in')
  const respostaMt = (o) => {
    if (o.k === 'ct:out') return ctIn.find((x) => x.t >= o.t) ?? null
    return mtInPorId.get(o.id) ?? null
  }
  const cap = [...d.cap].sort((a, b) => a.tSpeechStart - b.tSpeechStart)

  const falas = []
  for (const f of rot.falas) {
    const I = tDoArquivo(f.iniS)
    const E = tDoArquivo(f.fimS)
    const seqs = cap.filter((m) => m.tSpeechStart >= I - 400 && m.tSpeechStart <= E + 300)
    const linha = { k: f.k, durVozS: f.durVozS, trechos: seqs.length }
    if (!seqs.length) {
      linha.perdida = true
      falas.push(linha)
      continue
    }
    const ult = [...seqs].reverse().find((m) => m.tFinalDone !== undefined && m.text) ?? seqs[seqs.length - 1]
    linha.texto = ult.text
    const primParcial = seqs.map((m) => m.tFirstPartial).filter(Number.isFinite)
    if (primParcial.length) linha.inicioAoPrimeiroTexto = Math.round(Math.min(...primParcial) - I)
    linha.parciais = seqs.reduce((s, m) => s + (m.partialCount || 0), 0)
    if (ult.tSpeechEnd === undefined) {
      linha.semFinal = true
      falas.push(linha)
      continue
    }
    linha.vad = Math.round(ult.tSpeechEnd - E)
    linha.audioMs = ult.audioMs
    // decode final
    const tamanhoDoFinal = (o) => o.n >= (ult.audioMs / 1000) * 16000 * 0.9
    const P =
      sttOut.find((o) => o.t >= ult.tSpeechEnd - 5 && o.t <= ult.tSpeechEnd + 3000 && tamanhoDoFinal(o)) ??
      // FINAL ESPECULATIVO (depois de 2026-09-26): o decode do final é postado com ~450 ms de silêncio,
      // ANTES de o VAD fechar, e o fim da fala reaproveita o resultado. É o último post com resultado
      // (os cancelados não têm) no segundo antes do fechamento. `stt` passa a contar desde esse post.
      sttOut
        .filter((o) => o.t >= ult.tSpeechEnd - 1000 && o.t < ult.tSpeechEnd && tamanhoDoFinal(o) && sttIn.has(o.id))
        .at(-1)
    if (P) {
      const R = sttIn.get(P.id)
      if (R) {
        linha.stt = Math.round(R.t - P.t)
        const upd = sttUpd.find((u) => u.id === P.id)
        if (upd) linha.primeiroToken = Math.round(upd.t - P.t)
        // parcial ainda em voo quando o final foi postado?
        const emVoo = sttOut
          .filter((o) => o.t < P.t && o.id !== P.id)
          .map((o) => sttIn.get(o.id))
          .filter((r) => r && r.t > P.t)
        linha.sttEspera = emVoo.length ? Math.round(Math.max(...emVoo.map((r) => r.t)) - P.t) : 0
        linha.rtf = +((R.t - P.t) / ult.audioMs).toFixed(3)
        const Do = dom.find((r) => r.t >= R.t - 2 && !r.nova && r.o && parecido(r.o, ult.text))
        if (Do) {
          linha.renderOrig = Math.round(Do.t - R.t)
          linha.fimAoOriginal = Math.round(Do.t - E)
          if (Do.tf) linha.fimAoOriginalQuadro = Math.round(Do.tf - E)
        }
        // tradução do texto final
        const Mp =
          mtOut.find((o) => o.t >= R.t - 2 && o.t <= R.t + 15_000 && parecido(o.text, ult.text)) ??
          mtOut.find((o) => o.t >= R.t - 2 && o.t <= R.t + 400)
        const traducaoNaTela = (desde) =>
          dom.find((r) => r.t >= desde && !r.nova && r.o && parecido(r.o, ult.text) && r.tr && r.tr !== '…')
        if (Mp) {
          const Mr = respostaMt(Mp)
          linha.mtEspera = Math.round(Mp.t - R.t)
          linha.mtMotor = Mp.k === 'ct:out' ? 'chrome-translator' : 'opus-mt'
          if (Mr) {
            linha.mt = Math.round(Mr.t - Mp.t)
            linha.traducao = Mr.text
            const Dt = dom.find((r) => r.t >= Mr.t - 2 && r.tr && parecido(r.tr, Mr.text))
            if (Dt) {
              linha.renderTrad = Math.round(Dt.t - Mr.t)
              linha.fimATraducao = Math.round(Dt.t - E)
            }
          }
        } else {
          // sem pedido de MT visível: cache, expressão pronta, rede (MyMemory) ou degradação
          const Dt = traducaoNaTela(R.t)
          if (Dt) {
            linha.fimATraducao = Math.round(Dt.t - E)
            linha.mtMotor = /^\(.*\)$/.test(Dt.tr) ? 'degradada' : Dt.tr.startsWith('≈') ? 'mymemory' : 'outro'
            linha.traducao = Dt.tr
          }
        }
        // alguma tradução de PARCIAL já na tela quando a voz acabou?
        const parciaisDaFala = new Set(
          sttOut
            .filter((o) => o.t >= I - 400 && o.t < ult.tSpeechEnd - 5)
            .map((o) => sttIn.get(o.id)?.text)
            .filter(Boolean)
            .map(norm),
        )
        const trParciais = mtOut
          .filter((o) => parciaisDaFala.has(norm(o.text)))
          .map(respostaMt)
          .filter(Boolean)
        if (trParciais.length) {
          const pri = Math.min(...trParciais.map((r) => r.t))
          linha.primeiraTraducaoParcialAntesDoFim = Math.round(E - pri)
        }
      }
    }
    falas.push(linha)
  }

  // cargas de modelo
  const tIni = d.tIniciarPerf
  const whisperLoad = ev.find((e) => e.k === 'w:out' && e.type === 'load' && e.nome?.startsWith('whisperWorker'))
  const whisperReady = ev.find((e) => e.k === 'w:in' && e.nome?.startsWith('whisperWorker') && e.type === 'ready')
  const mtReadys = ev
    .filter((e) => e.k === 'w:in' && e.nome?.startsWith('mtWorker') && e.type === 'ready')
    .map((e) => ({ modelo: e.model, ms: Math.round(e.t - tIni) }))
  const manif = ev.filter((e) => e.manifesto && e.nome?.startsWith('whisperWorker')).map((e) => e.manifesto)
  const devices = [...new Set(manif.map((m) => (m.match(/"device":"(\w+)"/) || [])[1]).filter(Boolean))]
  const modeloStt = whisperLoad?.model
  const rota = ev.find((e) => e.k === 'log' && e.s.includes('roteador STT'))?.s
  const loafs = d.lat.loaf || []
  return {
    rotulo: d.rotulo,
    config: d.config,
    ui: d.ui,
    gpuInfo: d.gpuInfo,
    coi: d.coi,
    modeloStt,
    dispositivos: devices,
    rota: rota?.replace(/^\s*\[cap\]\s*/, ''),
    carga: {
      sttProntoMs: whisperReady ? Math.round(whisperReady.t - tIni) : null,
      mtProntos: mtReadys,
      pedidosAoHub: d.pedidosAoHub,
    },
    primeiraLegendaMs: (() => {
      const f = falas.find((x) => Number.isFinite(x.fimAoOriginal))
      return f ? { fala: f.k, fimAoOriginal: f.fimAoOriginal, fimATraducao: f.fimATraducao } : null
    })(),
    mainThread: {
      loafs: loafs.length,
      loafMs: loafs.reduce((s, l) => s + l.ms, 0),
      maiores: [...loafs].sort((a, b) => b.ms - a.ms).slice(0, 5),
    },
    erros: d.erros,
    falas: falas.slice(pular),
    todasFalas: falas,
  }
}

const METRICAS = [
  'vad',
  'sttEspera',
  'stt',
  'primeiroToken',
  'renderOrig',
  'mtEspera',
  'mt',
  'renderTrad',
  'fimAoOriginal',
  'fimATraducao',
  'inicioAoPrimeiroTexto',
  'primeiraTraducaoParcialAntesDoFim',
  'rtf',
]

export function resumir(rodadas) {
  const falas = rodadas.flatMap((r) => r.falas)
  const out = { n: falas.length, perdidas: falas.filter((f) => f.perdida).length }
  for (const m of METRICAS) {
    const xs = falas.map((f) => f[m]).filter((x) => Number.isFinite(x))
    out[m] = xs.length
      ? {
          p50: m === 'rtf' ? +pctF(xs, 50).toFixed(3) : pct(xs, 50),
          p95: m === 'rtf' ? +pctF(xs, 95).toFixed(3) : pct(xs, 95),
          n: xs.length,
        }
      : null
  }
  out.comTraducaoParcialAntesDoFim = falas.filter(
    (f) => Number.isFinite(f.primeiraTraducaoParcialAntesDoFim) && f.primeiraTraducaoParcialAntesDoFim >= 0,
  ).length
  out.motoresMt = [...new Set(falas.map((f) => f.mtMotor).filter(Boolean))]
  return out
}
function pctF(xs, p) {
  const s = [...xs].sort((a, b) => a - b)
  const h = (s.length - 1) * (p / 100)
  const lo = Math.floor(h)
  return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (h - lo)
}

if (process.argv[1] && process.argv[1].endsWith('analisar.mjs')) {
  const rodadas = arquivos.map((a) => analisarRodada(JSON.parse(readFileSync(a, 'utf8')), PULAR))
  for (const r of rodadas) {
    console.log(
      `\n== ${r.rotulo}  modelo=${r.modeloStt} device=${r.dispositivos.join('+')} gpu=${r.gpuInfo} coi=${r.coi}`,
    )
    console.log(`   rota: ${r.rota}`)
    console.log(
      `   carga: STT pronto ${r.carga.sttProntoMs} ms; MT ${JSON.stringify(r.carga.mtProntos)}; pedidos ao Hub ${r.carga.pedidosAoHub}`,
    )
    console.log(
      `   main thread: ${r.mainThread.loafs} LoAF > 50 ms, ${r.mainThread.loafMs} ms; maiores ${JSON.stringify(r.mainThread.maiores.slice(0, 2))}`,
    )
    if (r.erros?.length) console.log(`   erros: ${r.erros.slice(0, 3).join(' | ')}`)
    for (const f of r.todasFalas) {
      const c = (k) => (f[k] === undefined ? '·' : f[k])
      console.log(
        `   #${f.k} voz ${f.durVozS}s trechos ${f.trechos} | 1ºtexto ${c('inicioAoPrimeiroTexto')} | vad ${c('vad')} stt ${c('stt')} (espera ${c('sttEspera')}, 1ºtok ${c('primeiroToken')}) rOrig ${c('renderOrig')} | mtEsp ${c('mtEspera')} mt ${c('mt')} [${c('mtMotor')}] rTrad ${c('renderTrad')} | FIM→orig ${c('fimAoOriginal')} FIM→trad ${c('fimATraducao')} | tradParcial ${c('primeiraTraducaoParcialAntesDoFim')} | "${String(f.texto || '').slice(0, 50)}"`,
      )
    }
  }
  const resumo = resumir(rodadas)
  console.log(`\n== RESUMO (${opt('grupo', 'grupo')}, pulando ${PULAR} por rodada)`)
  console.log(JSON.stringify(resumo, null, 1))
  const j = opt('json', '')
  if (j)
    writeFileSync(
      j,
      JSON.stringify(
        {
          grupo: opt('grupo', ''),
          pular: PULAR,
          resumo,
          rodadas: rodadas.map(({ todasFalas, ...r }) => ({ ...r, falas: todasFalas })),
        },
        null,
        1,
      ),
    )
}
