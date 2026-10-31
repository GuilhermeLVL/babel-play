/**
 * Round-trip da bancada de voz: WAV sintetizado -> Whisper -> WER/CER e itens difíceis.
 *
 * Uso (precisa de `tsx`, porque importa TypeScript de `src/core`):
 *   node --import tsx scripts/eval-voz/medir-roundtrip.mjs --motor <id> --voz <id> --entrada <dir de wavs>
 *
 * Espera um `<id>.wav` por item do corpus (`corpus-voz.jsonl`) na pasta de entrada. WAV ausente conta em
 * `semAudio` (falha dura nos limiares), não derruba a medição. Grava `docs/auditoria/eval/voz-<motor>-<voz>.json`.
 *
 * O Whisper usa as MESMAS opções de decode de `scripts/eval-fala/medir-wer.mjs` (espelho de
 * `whisperWorker.ts`): guloso, sem timestamps, `no_repeat_ngram_size: 3`, `repetition_penalty: 1.15`.
 * `condition_on_previous_text=false` equivale, aqui, a decodificar cada frase isolada (uma janela só,
 * sem texto anterior como prompt). As pontas em silêncio são cortadas antes (a mesma faixa que o VAD
 * do produto entrega). Sem rede além do download do modelo pelo `@huggingface/transformers`.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { duracaoDoWav } from '../audiolivros/wav.mjs'
import { LIMIARES_DA_SPEC, lerCorpus } from './comum.mjs'
import { acertoDosItens, avaliarContraLimiares, normalizarParaComparar } from './metricas.mjs'
import { agregar } from '../../src/core/eval/wer.ts'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const RAIZ = path.resolve(AQUI, '..', '..')
const CORPUS = path.join(AQUI, 'corpus-voz.jsonl')
const MODELO_WHISPER = 'onnx-community/whisper-small'
const IDIOMAS = ['pt', 'en', 'es']

const mediana = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/**
 * Orquestração pura. `transcrever(item)` devolve o texto ouvido, ou `null`/`undefined` se não há áudio.
 * `duracaoDe(item)` (opcional) devolve a duração em segundos, para o teste de ±30% da mediana.
 * @param {{ corpus: import('./comum.mjs').CorpusItem[],
 *           transcrever: (item: import('./comum.mjs').CorpusItem) => Promise<string|null|undefined>,
 *           duracaoDe?: (item: import('./comum.mjs').CorpusItem) => number|undefined }} p
 */
export async function medirRoundtrip({ corpus, transcrever, duracaoDe }) {
  const frases = []
  for (const item of corpus) {
    const hip = await transcrever(item)
    if (hip === null || hip === undefined) {
      frases.push({ id: item.id, idioma: item.idioma, referencia: item.texto, hipotese: null, semAudio: true })
      continue
    }
    const referencia = normalizarParaComparar(item.texto, item.idioma)
    const hipotese = normalizarParaComparar(hip, item.idioma)
    const { wer, cer } = agregar([{ id: item.id, referencia, hipotese }])
    frases.push({
      id: item.id,
      idioma: item.idioma,
      referencia: item.texto,
      hipotese: hip,
      semAudio: false,
      wer,
      cer,
      itens: acertoDosItens(hip, item.itens, item.idioma),
      duracaoS: duracaoDe?.(item),
    })
  }

  const porIdioma = {}
  for (const idioma of IDIOMAS) {
    const doIdioma = frases.filter((f) => f.idioma === idioma)
    if (doIdioma.length === 0) continue
    const comAudio = doIdioma.filter((f) => !f.semAudio)
    const agg = agregar(
      comAudio.map((f) => ({
        id: f.id,
        referencia: normalizarParaComparar(f.referencia, idioma),
        hipotese: normalizarParaComparar(f.hipotese, idioma),
      })),
    )
    let acertos = 0,
      total = 0,
      numAcertos = 0,
      numTotal = 0
    for (const f of comAudio) {
      acertos += f.itens.acertos
      total += f.itens.total
      for (const tipo of ['numero', 'ano']) {
        const [a, t] = f.itens.porTipo[tipo] ?? [0, 0]
        numAcertos += a
        numTotal += t
      }
    }
    const medidas = {
      cer: agg.cer,
      wer: agg.wer,
      itensAcerto: total === 0 ? 1 : acertos / total,
      itensNumerosEAnos: numTotal === 0 ? 1 : numAcertos / numTotal,
      semAudio: doIdioma.length - comAudio.length,
    }
    // Duração por caractere contra a mediana da própria voz (spec §7.2): só se o chamador deu durações.
    const razoes = comAudio
      .filter((f) => Number.isFinite(f.duracaoS) && f.referencia.length > 0)
      .map((f) => ({ id: f.id, r: f.duracaoS / f.referencia.length }))
    if (razoes.length > 0) {
      const med = mediana(razoes.map((x) => x.r))
      const fora = razoes.filter((x) => Math.abs(x.r / med - 1) > 0.3).length
      medidas.foraDaMediana = fora / razoes.length
    }
    porIdioma[idioma] = medidas
  }
  return { medidas: { porIdioma }, frases }
}

/** Corta o silêncio das pontas (amplitude < 0,01), deixando 100 ms de margem. */
function cortarSilencio(pcm, taxa = 16000) {
  const limiar = 0.01
  let ini = 0
  let fim = pcm.length - 1
  while (ini < fim && Math.abs(pcm[ini]) < limiar) ini++
  while (fim > ini && Math.abs(pcm[fim]) < limiar) fim--
  const margem = Math.round(taxa * 0.1)
  return pcm.subarray(Math.max(0, ini - margem), Math.min(pcm.length, fim + 1 + margem))
}

/** WAV PCM 16-bit -> Float32 mono a 16 kHz (reamostragem linear, como `medir-wer.mjs`). */
function wavParaPcm16k(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE')
    throw new Error('não é um WAV RIFF')
  let pos = 12,
    fmt = null,
    dados = null
  while (pos + 8 <= buf.length) {
    const id = buf.toString('ascii', pos, pos + 4)
    const tam = buf.readUInt32LE(pos + 4)
    const corpo = pos + 8
    if (id === 'fmt ')
      fmt = {
        canais: buf.readUInt16LE(corpo + 2),
        taxa: buf.readUInt32LE(corpo + 4),
        bits: buf.readUInt16LE(corpo + 14),
      }
    else if (id === 'data') dados = buf.subarray(corpo, Math.min(corpo + tam, buf.length))
    pos = corpo + tam + (tam % 2)
  }
  if (!fmt || !dados) throw new Error('WAV sem fmt ou data')
  if (fmt.bits !== 16) throw new Error(`esperado PCM 16-bit, veio ${fmt.bits}`)
  const n = Math.floor(dados.length / 2 / fmt.canais)
  const mono = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    let soma = 0
    for (let c = 0; c < fmt.canais; c++) soma += dados.readInt16LE((i * fmt.canais + c) * 2)
    mono[i] = soma / fmt.canais / 32768
  }
  if (fmt.taxa === 16000) return mono
  const razao = fmt.taxa / 16000
  const saida = new Float32Array(Math.floor(n / razao))
  for (let i = 0; i < saida.length; i++) {
    const x = i * razao
    const i0 = Math.floor(x)
    const i1 = Math.min(i0 + 1, n - 1)
    saida[i] = mono[i0] + (mono[i1] - mono[i0]) * (x - i0)
  }
  return saida
}

/** Cria o transcritor Whisper real (carrega o modelo uma vez). Import dinâmico: os testes não o tocam. */
async function criarTranscritorWhisper(pasta) {
  const { pipeline, env } = await import('@huggingface/transformers')
  env.allowLocalModels = false
  const asr = await pipeline('automatic-speech-recognition', MODELO_WHISPER, { dtype: 'q8', device: 'cpu' })
  return async (item) => {
    const arquivo = path.join(pasta, `${item.id}.wav`)
    if (!existsSync(arquivo)) return null
    const pcm = cortarSilencio(wavParaPcm16k(readFileSync(arquivo)))
    const audioSec = pcm.length / 16000
    const out = await asr(pcm, {
      language: item.idioma,
      task: 'transcribe',
      return_timestamps: false,
      num_beams: 1,
      do_sample: false,
      max_new_tokens: Math.max(8, Math.min(128, Math.round(audioSec * 15))),
      no_repeat_ngram_size: 3,
      repetition_penalty: 1.15,
    })
    return (out.text ?? '').trim()
  }
}

function lerArgumentos(argv) {
  const pegar = (nome) => {
    const i = argv.indexOf(`--${nome}`)
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : undefined
  }
  const motor = pegar('motor')
  const voz = pegar('voz')
  const entrada = pegar('entrada')
  if (!motor || !/^[\w.-]+$/.test(motor) || motor.startsWith('.'))
    throw new Error('--motor <id> é obrigatório (letras, números, "_", "-", ".")')
  if (!voz || !/^[\w.-]+$/.test(voz) || voz.startsWith('.'))
    throw new Error('--voz <id> é obrigatório (letras, números, "_", "-", ".")')
  if (!entrada) throw new Error('--entrada <dir de wavs> é obrigatório')
  if (!existsSync(entrada) || !statSync(entrada).isDirectory())
    throw new Error(`--entrada: "${entrada}" não é uma pasta`)
  return { motor, voz, entrada: path.resolve(entrada) }
}

async function main() {
  const { motor, voz, entrada } = lerArgumentos(process.argv.slice(2))
  const corpus = lerCorpus(CORPUS)
  const transcrever = await criarTranscritorWhisper(entrada)
  const duracaoDe = (item) => {
    const arquivo = path.join(entrada, `${item.id}.wav`)
    return existsSync(arquivo) ? duracaoDoWav(readFileSync(arquivo)) : undefined
  }
  const { medidas, frases } = await medirRoundtrip({ corpus, transcrever, duracaoDe })
  const avaliacao = avaliarContraLimiares(medidas, LIMIARES_DA_SPEC)

  const saida = path.join(RAIZ, 'docs', 'auditoria', 'eval', `voz-${motor}-${voz}.json`)
  mkdirSync(path.dirname(saida), { recursive: true })
  writeFileSync(
    saida,
    JSON.stringify(
      { geradoEm: new Date().toISOString(), motor, voz, whisper: MODELO_WHISPER, medidas, avaliacao, frases },
      null,
      2,
    ),
  )

  for (const [idioma, m] of Object.entries(medidas.porIdioma)) {
    console.log(
      `${idioma}: CER ${(m.cer * 100).toFixed(1)}%  WER ${(m.wer * 100).toFixed(1)}%  itens ${(m.itensAcerto * 100).toFixed(0)}%  semAudio ${m.semAudio}`,
    )
  }
  console.log(avaliacao.passou ? 'limiares: passou' : `limiares: reprovou\n  - ${avaliacao.falhas.join('\n  - ')}`)
  console.log(`resultado: ${saida}`)
}

// Só roda como script; importado pelos testes não faz nada.
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((e) => {
    console.error(`erro: ${e.message}`)
    process.exit(1)
  })
}
