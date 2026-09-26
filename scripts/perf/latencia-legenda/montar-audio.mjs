#!/usr/bin/env node
/**
 * MONTA O ÁUDIO DE TESTE da auditoria de latência da legenda (2026-09-26).
 *
 *   node scripts/perf/latencia-legenda/montar-audio.mjs --idioma pt|en [--n 12] [--saida DIR]
 *
 * Fala REAL do FLEURS (a mesma da bancada de 2026-09: `%LOCALAPPDATA%/babel-bancada/stt/fleurs_<idioma>`,
 * baixada por `scripts/eval-fala/baixar-bancada.py`), concatenada com PAUSAS CONHECIDAS, num WAV
 * 16 kHz mono PCM16 que o Chromium toca como microfone falso
 * (`--use-file-for-fake-audio-capture=<wav>`).
 *
 * Layout do arquivo (tudo em segundos, gravado no roteiro JSON ao lado do WAV):
 *
 *   [silêncio INICIAL] [bipe 2 kHz, 150 ms] [2 s] [fala 1] [pausa 1] [fala 2] … [fala N] [silêncio final]
 *
 *  - o silêncio inicial (padrão 30 s) deixa os modelos subirem ANTES da primeira fala no regime
 *    estável (perfil com cache). Na primeira carga (perfil vazio) ele não basta, e é isso que se quer
 *    medir: o que a pessoa vive enquanto o modelo baixa;
 *  - o BIPE é a âncora de relógio: a sonda injetada na página o detecta (Goertzel em 2 kHz) e daí
 *    converte "fim da fala no arquivo" em `performance.now()` da página;
 *  - cada clipe do FLEURS é APARADO na fala (energia por quadro de 20 ms), então `fimS` de cada
 *    fala é o fim REAL da voz, não o do arquivo original (que tem silêncio de sobra);
 *  - as pausas alternam 1,2 / 1,6 / 2,0 / 2,4 s: todas maiores que os 800 ms do `redemptionMs` do
 *    VAD, como numa conversa em que o outro responde logo.
 *
 * Escolhe falas com 2–5,8 s de voz (turno de conversa, abaixo do corte forçado de 6 s do VAD local), as primeiras N em ordem de id — determinístico.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`)
  return i > -1 && args[i + 1] ? args[i + 1] : d
}
const IDIOMA = opt('idioma', 'pt')
const N = Number(opt('n', 12))
const SIL_INICIAL = Number(opt('silencio-inicial', 30))
const BANCADA = process.env.BANCADA_DIR || path.join(process.env.LOCALAPPDATA || '.', 'babel-bancada')
const SAIDA = opt('saida', path.join(process.env.TEMP || '.', 'latencia-legenda'))
const SR = 16000
const PAUSAS = [1.2, 1.6, 2.0, 2.4]
const VOZ_MIN = Number(opt('voz-min', 2))
const VOZ_MAX = Number(opt('voz-max', 5.8))

function lerWav(arq) {
  const b = readFileSync(arq)
  if (b.toString('ascii', 0, 4) !== 'RIFF') throw new Error(`não é WAV: ${arq}`)
  let off = 12
  let fmt = null
  while (off < b.length) {
    const id = b.toString('ascii', off, off + 4)
    const tam = b.readUInt32LE(off + 4)
    if (id === 'fmt ')
      fmt = { canais: b.readUInt16LE(off + 10), sr: b.readUInt32LE(off + 12), bits: b.readUInt16LE(off + 22) }
    if (id === 'data') {
      if (!fmt || fmt.canais !== 1 || fmt.sr !== SR || fmt.bits !== 16) throw new Error(`formato inesperado em ${arq}`)
      const n = tam / 2
      const out = new Float32Array(n)
      for (let i = 0; i < n; i++) out[i] = b.readInt16LE(off + 8 + i * 2) / 32768
      return out
    }
    off += 8 + tam + (tam % 2)
  }
  throw new Error(`sem bloco data: ${arq}`)
}

/** Limites da voz por energia (quadros de 20 ms). Limiar = pico − 35 dB, ou piso de ruído + 6 dB se maior. */
function limitesDaFala(x) {
  const q = SR * 0.02
  const db = []
  for (let i = 0; i + q <= x.length; i += q) {
    let s = 0
    for (let j = 0; j < q; j++) s += x[i + j] * x[i + j]
    db.push(10 * Math.log10(s / q + 1e-12))
  }
  const ordenado = [...db].sort((a, b) => a - b)
  const piso = ordenado[Math.floor(ordenado.length * 0.1)]
  // Relativo ao PICO do clipe: parte do FLEURS vem a −38 dBFS, e um limiar absoluto cortava o começo e o fim da frase.
  const lim = Math.max(ordenado[ordenado.length - 1] - 35, piso + 6)
  const ini = db.findIndex((d) => d > lim)
  const fim = db.length - 1 - [...db].reverse().findIndex((d) => d > lim)
  if (ini < 0) return null
  return { iniA: ini * q, fimA: (fim + 1) * q }
}

const linhas = readFileSync(path.join(BANCADA, 'stt', `fleurs_${IDIOMA}.jsonl`), 'utf8')
  .trim()
  .split('\n')
  .map((l) => JSON.parse(l))
const escolhidas = []
for (const l of linhas.sort((a, b) => a.floresId - b.floresId)) {
  const arq = path.join(BANCADA, l.arquivo)
  if (!existsSync(arq)) continue
  const x = lerWav(arq)
  const lim = limitesDaFala(x)
  if (!lim) continue
  const margem = Math.round(SR * 0.05)
  const ini = Math.max(0, lim.iniA - margem)
  const fim = Math.min(x.length, lim.fimA + margem)
  const durVoz = (lim.fimA - lim.iniA) / SR
  if (durVoz < VOZ_MIN || durVoz > VOZ_MAX) continue
  /* NÍVEL: parte dos clipes do FLEURS vem a −38 dBFS de pico. O Silero, sem o AGC do microfone,
     perde palavras inteiras nesse nível (medido na 1ª rodada de teste: o começo das frases sumia).
     Normaliza a VOZ para RMS −20 dBFS (nível típico de fala em vídeo/chamada), com pico ≤ −1 dBFS. */
  const trecho = x.slice(ini, fim)
  let soma = 0
  let pico = 0
  for (let i = lim.iniA - ini; i < lim.fimA - ini; i++) {
    soma += trecho[i] * trecho[i]
    pico = Math.max(pico, Math.abs(trecho[i]))
  }
  const rms = Math.sqrt(soma / (lim.fimA - lim.iniA))
  const ganho = Math.min(10 ** (-20 / 20) / rms, 0.89 / pico)
  for (let i = 0; i < trecho.length; i++) trecho[i] *= ganho
  escolhidas.push({
    id: l.id,
    referencia: l.referencia,
    pcm: trecho,
    vozIni: (lim.iniA - ini) / SR,
    vozFim: (lim.fimA - ini) / SR,
    ganhoDb: +(20 * Math.log10(ganho)).toFixed(1),
  })
  if (escolhidas.length >= N) break
}
if (escolhidas.length < N) throw new Error(`só ${escolhidas.length} falas de ${VOZ_MIN}–${VOZ_MAX} s em ${IDIOMA}`)

const pedacos = []
let t = 0
const empurrar = (arr) => {
  pedacos.push(arr)
  t += arr.length / SR
}
const silencio = (s) => new Float32Array(Math.round(s * SR))

empurrar(silencio(SIL_INICIAL))
const bipeS = t
const bipe = new Float32Array(Math.round(0.15 * SR))
for (let i = 0; i < bipe.length; i++) {
  const env = Math.min(1, i / 80, (bipe.length - i) / 80) // rampa de 5 ms: sem clique
  bipe[i] = 0.3 * env * Math.sin((2 * Math.PI * 2000 * i) / SR)
}
empurrar(bipe)
empurrar(silencio(2))
const falas = []
escolhidas.forEach((e, k) => {
  const inicioArquivo = t
  empurrar(e.pcm)
  falas.push({
    k,
    id: e.id,
    referencia: e.referencia,
    iniS: +(inicioArquivo + e.vozIni).toFixed(3),
    fimS: +(inicioArquivo + e.vozFim).toFixed(3),
    durVozS: +(e.vozFim - e.vozIni).toFixed(3),
    ganhoDb: e.ganhoDb,
  })
  empurrar(silencio(k === escolhidas.length - 1 ? 6 : PAUSAS[k % PAUSAS.length]))
})

const total = pedacos.reduce((s, p) => s + p.length, 0)
const buf = Buffer.alloc(44 + total * 2)
buf.write('RIFF', 0)
buf.writeUInt32LE(36 + total * 2, 4)
buf.write('WAVE', 8)
buf.write('fmt ', 12)
buf.writeUInt32LE(16, 16)
buf.writeUInt16LE(1, 20)
buf.writeUInt16LE(1, 22)
buf.writeUInt32LE(SR, 24)
buf.writeUInt32LE(SR * 2, 28)
buf.writeUInt16LE(2, 32)
buf.writeUInt16LE(16, 34)
buf.write('data', 36)
buf.writeUInt32LE(total * 2, 40)
let o = 44
for (const p of pedacos)
  for (let i = 0; i < p.length; i++) {
    buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(p[i] * 32767))), o)
    o += 2
  }
mkdirSync(SAIDA, { recursive: true })
const base = path.join(SAIDA, `conversa_${IDIOMA}_${N}`)
writeFileSync(`${base}.wav`, buf)
const roteiro = {
  idioma: IDIOMA,
  sr: SR,
  silencioInicialS: SIL_INICIAL,
  bipeS,
  duracaoS: +(total / SR).toFixed(3),
  pausasS: PAUSAS,
  falas,
}
writeFileSync(`${base}.json`, JSON.stringify(roteiro, null, 2))
console.log(
  `${base}.wav  ${roteiro.duracaoS} s, ${falas.length} falas, voz média ${(falas.reduce((s, f) => s + f.durVozS, 0) / falas.length).toFixed(2)} s`,
)
