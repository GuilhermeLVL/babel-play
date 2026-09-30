#!/usr/bin/env node
/**
 * MONTA O ÁUDIO DE TESTE da auditoria de latência da legenda (2026-09-26) e da bancada de desempenho
 * da captura (A0, 2026-09-29).
 *
 *   node scripts/perf/latencia-legenda/montar-audio.mjs --idioma pt|en [--n 12] [--saida DIR]
 *        [--silencio-inicial 30] [--silencio-final 6] [--voz-min 2] [--voz-max 5.8] [--nome BASE]
 *        [--fixture <falas.json>]          as falas vêm do fixture versionado, não do FLEURS local
 *        [--gerar-fixture <falas.json>]    grava o fixture (WAV µ-law + JSON) com as falas escolhidas
 *
 * Fala REAL do FLEURS (a mesma da bancada de 2026-09: `%LOCALAPPDATA%/babel-bancada/stt/fleurs_<idioma>`,
 * baixada por `scripts/eval-fala/baixar-bancada.py`), concatenada com PAUSAS CONHECIDAS, num WAV
 * 16 kHz mono PCM16 que o Chromium toca como microfone falso
 * (`--use-file-for-fake-audio-capture=<wav>`).
 *
 * FIXTURE: o CI não tem o FLEURS local. `--gerar-fixture` guarda as MESMAS falas já aparadas e
 * normalizadas num WAV µ-law (8 bits, metade do PCM16 — ver `wav.mjs`) com um JSON ao lado (onde
 * cada fala começa, a referência, a licença). `--fixture` monta o áudio da rodada a partir dele,
 * igual em qualquer máquina. O da bancada é `tests/fixtures/bancada-captura/fleurs-en-8.json`.
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
 *    VAD, como numa conversa em que o outro responde logo;
 *  - o silêncio FINAL (padrão 6 s) é, na bancada de desempenho, a janela em que se mede a CPU e os
 *    renders/s com a captura ligada e nada para transcrever.
 *
 * Escolhe falas com 2–5,8 s de voz (turno de conversa, abaixo do corte forçado de 6 s do VAD local), as primeiras N em ordem de id — determinístico.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { lerWav, wavMulaw, wavPcm16 } from './wav.mjs'

const args = process.argv.slice(2)
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`)
  return i > -1 && args[i + 1] ? args[i + 1] : d
}
const IDIOMA = opt('idioma', 'pt')
const N = Number(opt('n', 12))
const SIL_INICIAL = Number(opt('silencio-inicial', 30))
const SIL_FINAL = Number(opt('silencio-final', 6))
const BANCADA = process.env.BANCADA_DIR || path.join(process.env.LOCALAPPDATA || '.', 'babel-bancada')
const SAIDA = opt('saida', path.join(process.env.TEMP || '.', 'latencia-legenda'))
const SR = 16000
const PAUSAS = [1.2, 1.6, 2.0, 2.4]
const VOZ_MIN = Number(opt('voz-min', 2))
const VOZ_MAX = Number(opt('voz-max', 5.8))
const FIXTURE = opt('fixture', '')
const GERAR_FIXTURE = opt('gerar-fixture', '')

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

/** As falas do FLEURS local: aparadas na voz (± 50 ms) e normalizadas. */
function falasDoFleurs() {
  const linhas = readFileSync(path.join(BANCADA, 'stt', `fleurs_${IDIOMA}.jsonl`), 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l))
  const escolhidas = []
  for (const l of linhas.sort((a, b) => a.floresId - b.floresId)) {
    const arq = path.join(BANCADA, l.arquivo)
    if (!existsSync(arq)) continue
    const x = lerWav(readFileSync(arq), { sr: SR }).amostras
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
  return escolhidas
}

/** As falas do fixture versionado (WAV µ-law com todas as falas em sequência + o JSON do mapa). */
function falasDoFixture(arqJson) {
  const mapa = JSON.parse(readFileSync(arqJson, 'utf8'))
  const x = lerWav(readFileSync(path.join(path.dirname(arqJson), mapa.wav)), { sr: SR }).amostras
  return mapa.falas.slice(0, N).map((f) => ({ ...f, pcm: x.slice(f.amostra, f.amostra + f.amostras) }))
}

if (GERAR_FIXTURE) {
  const falas = falasDoFleurs()
  const total = falas.reduce((s, f) => s + f.pcm.length, 0)
  const tudo = new Float32Array(total)
  let pos = 0
  const mapa = falas.map((f) => {
    tudo.set(f.pcm, pos)
    const item = {
      id: f.id,
      referencia: f.referencia,
      amostra: pos,
      amostras: f.pcm.length,
      vozIni: f.vozIni,
      vozFim: f.vozFim,
      ganhoDb: f.ganhoDb,
    }
    pos += f.pcm.length
    return item
  })
  const wav = path.basename(GERAR_FIXTURE).replace(/\.json$/, '.wav')
  mkdirSync(path.dirname(GERAR_FIXTURE), { recursive: true })
  writeFileSync(path.join(path.dirname(GERAR_FIXTURE), wav), wavMulaw(tudo, SR))
  writeFileSync(
    GERAR_FIXTURE,
    JSON.stringify(
      {
        fonte:
          'FLEURS (Conneau et al., 2022, "FLEURS: Few-shot Learning Evaluation of Universal Representations of Speech"), split de teste, https://huggingface.co/datasets/google/fleurs',
        licenca: 'CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)',
        modificacoes:
          'cada clipe aparado na voz (± 50 ms), normalizado a RMS −20 dBFS (pico ≤ −1 dBFS) e gravado em µ-law 8 bits, 16 kHz mono',
        geradoPor: 'scripts/perf/latencia-legenda/montar-audio.mjs --gerar-fixture',
        idioma: IDIOMA,
        vozS: [VOZ_MIN, VOZ_MAX],
        sr: SR,
        wav,
        falas: mapa,
      },
      null,
      2,
    ) + '\n',
  )
  console.log(`${GERAR_FIXTURE}: ${falas.length} falas, ${(total / SR).toFixed(1)} s, ${wav} em µ-law`)
  process.exit(0)
}

const escolhidas = FIXTURE ? falasDoFixture(FIXTURE) : falasDoFleurs()

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
  empurrar(silencio(k === escolhidas.length - 1 ? SIL_FINAL : PAUSAS[k % PAUSAS.length]))
})

const total = pedacos.reduce((s, p) => s + p.length, 0)
const tudo = new Float32Array(total)
let o = 0
for (const p of pedacos) {
  tudo.set(p, o)
  o += p.length
}
mkdirSync(SAIDA, { recursive: true })
const base = path.join(SAIDA, opt('nome', `conversa_${IDIOMA}_${N}`))
writeFileSync(`${base}.wav`, wavPcm16(tudo, SR))
const roteiro = {
  idioma: IDIOMA,
  sr: SR,
  silencioInicialS: SIL_INICIAL,
  silencioFinalS: SIL_FINAL,
  bipeS,
  duracaoS: +(total / SR).toFixed(3),
  pausasS: PAUSAS,
  ...(FIXTURE ? { fixture: path.basename(FIXTURE) } : {}),
  falas,
}
writeFileSync(`${base}.json`, JSON.stringify(roteiro, null, 2))
console.log(
  `${base}.wav  ${roteiro.duracaoS} s, ${falas.length} falas, voz média ${(falas.reduce((s, f) => s + f.durVozS, 0) / falas.length).toFixed(2)} s`,
)
