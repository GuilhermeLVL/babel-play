/**
 * Round-trip da bancada de voz: WAV sintetizado -> Whisper -> WER/CER e itens difíceis.
 *
 * Uso (precisa de `tsx`, porque importa TypeScript de `src/core`):
 *   node --import tsx scripts/eval-voz/medir-roundtrip.mjs --motor <id> --voz <id> --entrada <dir de wavs>
 *
 * `--entrada` costuma ser a pasta `<motor>/<voz>/` de `sintetizar.mjs`, que traz `origem.json`: se ele
 * contradiz `--motor/--voz`, a medição ABORTA (mediria a voz errada); sem `origem.json` segue, com um aviso
 * no resultado (`avisos`). O resultado traz `tipo: 'roundtrip'` (o `relatorio` classifica por ele).
 *
 * Limite conhecido (en/es): a normalização expande números por extenso SÓ em pt. Em en/es um Whisper que
 * transcreva "one thousand" contra "1000" na referência pontua como erro de WER/CER (e nos itens `numero`
 * só valem as grafias de `aceita`). O plano cobre números em en/es apenas se o orçamento permitir.
 *
 * Espera um `<id>.wav` por item do corpus (`corpus-voz.jsonl`) na pasta de entrada. WAV ausente conta em
 * `semAudio`; WAV inválido (8 bits, truncado, sem fmt/data, vazio, só silêncio) ou transcrição que lança
 * conta em `invalidos`, com a mensagem de erro no registro da frase. Nenhum dos dois derruba a rodada,
 * e ambos reprovam nos limiares. Grava `docs/auditoria/eval/voz-<motor>-<voz>.json`.
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

import { agregar } from '../../src/core/eval/wer.ts'
import { VERSAO_DO_PREPROCESSADOR } from '../../src/core/leitura/prepararTextoParaVoz.ts'
import { duracaoDoWav } from '../audiolivros/wav.mjs'
import {
  conferirOrigem,
  foraDaMediana,
  IDIOMAS,
  LIMIARES_DA_SPEC,
  lerCorpus,
  MIN_CLIPES_PARA_MEDIANA,
  nomeSeguro,
  pegarOpcao,
} from './comum.mjs'
import { acertoDosItens, avaliarContraLimiares, normalizarParaComparar } from './metricas.mjs'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const RAIZ = path.resolve(AQUI, '..', '..')
const CORPUS = path.join(AQUI, 'corpus-voz.jsonl')
export const MODELO_WHISPER = 'onnx-community/whisper-small'

export { MIN_CLIPES_PARA_MEDIANA }

/**
 * Orquestração pura. `transcrever(item)` devolve o texto ouvido, `null`/`undefined` se não há áudio,
 * ou LANÇA se o áudio é inválido (a mensagem vai para o registro da frase e conta em `invalidos`).
 * `duracaoDe(item)` (opcional) devolve a duração em segundos, para o teste de ±30% da mediana.
 * @param {{ corpus: import('./comum.mjs').CorpusItem[],
 *           transcrever: (item: import('./comum.mjs').CorpusItem) => Promise<string|null|undefined>,
 *           duracaoDe?: (item: import('./comum.mjs').CorpusItem) => number|undefined }} p
 */
export async function medirRoundtrip({ corpus, transcrever, duracaoDe }) {
  const frases = []
  for (const item of corpus) {
    let hip
    try {
      hip = await transcrever(item)
    } catch (e) {
      frases.push({
        id: item.id,
        idioma: item.idioma,
        referencia: item.texto,
        hipotese: null,
        semAudio: false,
        invalido: true,
        erro: e instanceof Error ? e.message : String(e),
      })
      continue
    }
    if (hip === null || hip === undefined) {
      frases.push({
        id: item.id,
        idioma: item.idioma,
        referencia: item.texto,
        hipotese: null,
        semAudio: true,
        invalido: false,
      })
      continue
    }
    const referenciaNormalizada = normalizarParaComparar(item.texto, item.idioma)
    const hipoteseNormalizada = normalizarParaComparar(hip, item.idioma)
    const { wer, cer } = agregar([{ id: item.id, referencia: referenciaNormalizada, hipotese: hipoteseNormalizada }])
    let duracaoS
    try {
      duracaoS = duracaoDe?.(item)
    } catch {
      duracaoS = undefined
    }
    frases.push({
      id: item.id,
      idioma: item.idioma,
      referencia: item.texto,
      referenciaNormalizada,
      hipotese: hip,
      hipoteseNormalizada,
      semAudio: false,
      invalido: false,
      wer,
      cer,
      itens: acertoDosItens(hip, item.itens, item.idioma, { ref: item.texto }),
      duracaoS,
    })
  }

  /** @type {import('./comum.mjs').Medidas['porIdioma']} */
  const porIdioma = {}
  for (const idioma of IDIOMAS) {
    const doIdioma = frases.filter((f) => f.idioma === idioma)
    if (doIdioma.length === 0) continue
    const medidosOk = doIdioma.filter((f) => !f.semAudio && !f.invalido)
    const agg = agregar(
      medidosOk.map((f) => ({ id: f.id, referencia: f.referenciaNormalizada, hipotese: f.hipoteseNormalizada })),
    )
    let acertos = 0,
      total = 0,
      numAcertos = 0,
      numTotal = 0
    for (const f of medidosOk) {
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
      semAudio: doIdioma.filter((f) => f.semAudio).length,
      invalidos: doIdioma.filter((f) => f.invalido).length,
    }
    // Duração por caractere NORMALIZADO (o que o sintetizador de fato leu) contra a mediana da própria
    // voz (spec §7.2). Só com durações informadas e ao menos MIN_CLIPES_PARA_MEDIANA clipes.
    const clipes = medidosOk
      .map((f) => ({ id: f.id, duracaoS: f.duracaoS, caracteres: f.referenciaNormalizada.length }))
      .filter((c) => Number.isFinite(c.duracaoS) && c.duracaoS > 0 && c.caracteres > 0)
    if (clipes.length >= MIN_CLIPES_PARA_MEDIANA) medidas.foraDaMediana = foraDaMediana(clipes).fracao
    porIdioma[idioma] = medidas
  }
  return { medidas: { porIdioma }, frases }
}

/** Amplitude abaixo da qual uma amostra conta como silêncio. */
const LIMIAR_DE_SILENCIO = 0.01

/** Corta o silêncio das pontas, deixando 100 ms de margem. */
function cortarSilencio(pcm, taxa = 16000) {
  let ini = 0
  let fim = pcm.length - 1
  while (ini < fim && Math.abs(pcm[ini]) < LIMIAR_DE_SILENCIO) ini++
  while (fim > ini && Math.abs(pcm[fim]) < LIMIAR_DE_SILENCIO) fim--
  const margem = Math.round(taxa * 0.1)
  return pcm.subarray(Math.max(0, ini - margem), Math.min(pcm.length, fim + 1 + margem))
}

/**
 * WAV PCM 16-bit -> Float32 mono a 16 kHz (reamostragem linear, como `medir-wer.mjs`).
 * Lança com mensagem clara para WAV que não dá para usar.
 */
function wavParaPcm16k(buf) {
  if (buf.length < 12 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE')
    throw new Error('não é um WAV RIFF')
  let pos = 12,
    fmt = null,
    dados = null
  while (pos + 8 <= buf.length) {
    const id = buf.toString('ascii', pos, pos + 4)
    const tam = buf.readUInt32LE(pos + 4)
    const corpo = pos + 8
    if (id === 'fmt ') {
      if (tam < 16 || corpo + 16 > buf.length) throw new Error('WAV truncado: bloco fmt incompleto')
      fmt = {
        formato: buf.readUInt16LE(corpo),
        canais: buf.readUInt16LE(corpo + 2),
        taxa: buf.readUInt32LE(corpo + 4),
        bits: buf.readUInt16LE(corpo + 14),
      }
    } else if (id === 'data') {
      if (corpo + tam > buf.length)
        throw new Error(`WAV truncado: data declara ${tam} bytes, mas só há ${buf.length - corpo}`)
      dados = buf.subarray(corpo, corpo + tam)
    }
    pos = corpo + tam + (tam % 2)
  }
  if (!fmt) throw new Error('WAV sem bloco fmt')
  if (!dados) throw new Error('WAV sem bloco data')
  if (fmt.formato !== 1 && fmt.formato !== 0xfffe) throw new Error(`esperado PCM (formato 1), veio ${fmt.formato}`)
  if (fmt.bits !== 16) throw new Error(`esperado PCM 16-bit, veio ${fmt.bits}`)
  if (fmt.canais < 1 || fmt.taxa < 1) throw new Error(`fmt inválido (canais ${fmt.canais}, taxa ${fmt.taxa})`)
  const n = Math.floor(dados.length / 2 / fmt.canais)
  if (n === 0) throw new Error('WAV com data vazio')
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

/**
 * Decodifica o WAV, recusa áudio vazio ou só silêncio (não vai ao Whisper) e corta o silêncio das pontas.
 * @param {Buffer} buf
 * @returns {Float32Array}
 */
export function prepararPcm(buf) {
  const pcm = wavParaPcm16k(buf)
  let pico = 0
  for (const a of pcm) pico = Math.max(pico, Math.abs(a))
  if (pico < LIMIAR_DE_SILENCIO) throw new Error('áudio vazio: só silêncio')
  return cortarSilencio(pcm)
}

/**
 * Opções de decode das FRASES curtas e isoladas (as de `scripts/eval-fala/medir-wer.mjs`): proíbem
 * trigramas repetidos e penalizam repetição, o que ajuda em frase solta. NÃO servem para medir
 * estabilidade (`medir-estabilidade.mjs` usa as suas).
 */
export const OPCOES_DE_DECODE_FRASE = { no_repeat_ngram_size: 3, repetition_penalty: 1.15 }

/**
 * Cria o decodificador Whisper real (carrega o modelo uma vez):
 * `(pcm 16 kHz, idioma, opcoes) => texto`. As opções de decode são POR CHAMADA; `max_new_tokens`, se
 * vier, vale no lugar do teto padrão (15 tokens/s, no máximo 128). Import dinâmico: os testes não o tocam.
 * Também usado por `medir-estabilidade.mjs`.
 */
export async function criarDecodificadorWhisper() {
  const { pipeline, env } = await import('@huggingface/transformers')
  env.allowLocalModels = false
  const asr = await pipeline('automatic-speech-recognition', MODELO_WHISPER, { dtype: 'q8', device: 'cpu' })
  return async (pcm, idioma, opcoes = OPCOES_DE_DECODE_FRASE) => {
    const audioSec = pcm.length / 16000
    const { max_new_tokens: teto, ...decode } = opcoes
    const out = await asr(pcm, {
      language: idioma,
      task: 'transcribe',
      return_timestamps: false,
      num_beams: 1,
      do_sample: false,
      max_new_tokens: teto ?? Math.max(8, Math.min(128, Math.round(audioSec * 15))),
      ...decode,
    })
    return (out.text ?? '').trim()
  }
}

/**
 * Transcritor por item do corpus: lê `<id>.wav` da pasta (ausente = `null`) e decodifica com
 * `OPCOES_DE_DECODE_FRASE`.
 * @param {{ pasta: string, decodificar: (pcm: Float32Array, idioma: string, opcoes: object) => Promise<string> }} p
 */
export function criarTranscritorDeItens({ pasta, decodificar }) {
  return async (item) => {
    const arquivo = path.join(pasta, `${item.id}.wav`)
    if (!existsSync(arquivo)) return null
    return decodificar(prepararPcm(readFileSync(arquivo)), item.idioma, OPCOES_DE_DECODE_FRASE)
  }
}

function lerArgumentos(argv) {
  const motor = nomeSeguro(pegarOpcao(argv, 'motor'), '--motor')
  const voz = nomeSeguro(pegarOpcao(argv, 'voz'), '--voz')
  const entrada = pegarOpcao(argv, 'entrada')
  if (!entrada) throw new Error('--entrada <dir de wavs> é obrigatório')
  if (!existsSync(entrada) || !statSync(entrada).isDirectory())
    throw new Error(`--entrada: "${entrada}" não é uma pasta`)
  const pasta = path.resolve(entrada)
  return { motor, voz, entrada: pasta, ...conferirOrigem(pasta, { motor, voz }, VERSAO_DO_PREPROCESSADOR) }
}

/**
 * O JSON que o round-trip grava. `tipo` identifica o resultado pelo CONTEÚDO (o nome do arquivo é ambíguo
 * com hífens em motor/voz).
 * @param {{ motor: string, voz: string, medidas: object, pendentes: string[], avaliacao: object, frases: object[],
 *           avisos?: string[], origem?: object|null, geradoEm?: string }} p
 */
export function montarRegistroDoRoundtrip({
  motor,
  voz,
  medidas,
  pendentes,
  avaliacao,
  frases,
  avisos = [],
  origem = null,
  geradoEm,
}) {
  return {
    tipo: 'roundtrip',
    geradoEm: geradoEm ?? new Date().toISOString(),
    motor,
    voz,
    whisper: MODELO_WHISPER,
    medidas,
    pendentes,
    avaliacao,
    ...(avisos.length > 0 ? { avisos } : {}),
    ...(origem ? { origem } : {}),
    frases,
  }
}

/** Métricas com limiar que este script não consegue medir (o resumo as lista como pendentes). */
function pendentesDe(medidas) {
  const pendentes = new Set(['estabilidade']) // vem de medir-estabilidade.mjs
  for (const m of Object.values(medidas.porIdioma)) if (m.foraDaMediana === undefined) pendentes.add('foraDaMediana')
  return [...pendentes]
}

async function main() {
  const { motor, voz, entrada, avisos, origem } = lerArgumentos(process.argv.slice(2))
  for (const a of avisos) console.warn(`aviso: ${a}`)
  const corpus = lerCorpus(CORPUS)
  const transcrever = criarTranscritorDeItens({ pasta: entrada, decodificar: await criarDecodificadorWhisper() })
  const duracaoDe = (item) => {
    const arquivo = path.join(entrada, `${item.id}.wav`)
    return existsSync(arquivo) ? duracaoDoWav(readFileSync(arquivo)) : undefined
  }
  const { medidas, frases } = await medirRoundtrip({ corpus, transcrever, duracaoDe })
  const pendentes = pendentesDe(medidas)
  const avaliacao = avaliarContraLimiares(medidas, LIMIARES_DA_SPEC, { ignorar: pendentes })

  const saida = path.join(RAIZ, 'docs', 'auditoria', 'eval', `voz-${motor}-${voz}.json`)
  mkdirSync(path.dirname(saida), { recursive: true })
  writeFileSync(
    saida,
    JSON.stringify(
      montarRegistroDoRoundtrip({ motor, voz, medidas, pendentes, avaliacao, frases, avisos, origem }),
      null,
      2,
    ),
  )

  for (const [idioma, m] of Object.entries(medidas.porIdioma)) {
    console.log(
      `${idioma}: CER ${(m.cer * 100).toFixed(1)}%  WER ${(m.wer * 100).toFixed(1)}%  itens ${(m.itensAcerto * 100).toFixed(0)}%  semAudio ${m.semAudio}  inválidos ${m.invalidos}`,
    )
  }
  for (const f of frases.filter((x) => x.invalido)) console.log(`  ! ${f.id}: ${f.erro}`)
  console.log(avaliacao.passou ? 'limiares: passou' : `limiares: reprovou\n  - ${avaliacao.falhas.join('\n  - ')}`)
  console.log(`pendentes (não medidas aqui, fora do veredito): ${pendentes.join(', ')}`)
  console.log(`resultado: ${saida}`)
}

// Só roda como script; importado pelos testes não faz nada.
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((e) => {
    console.error(`erro: ${e.message}`)
    process.exit(1)
  })
}
