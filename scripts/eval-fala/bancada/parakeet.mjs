/**
 * PARAKEET TDT 0.6B v3 em Node — onnxruntime-node (já é dependência: o VAD da bancada usa) sobre o
 * export ONNX no formato do `onnx-asr` (istupakov): `nemo128.onnx` (mel de 128 bandas), encoder,
 * `decoder_joint` e `vocab.txt`. É o MESMO formato que o `parakeet.js` carrega no navegador com o
 * onnxruntime-web — o que a bancada medir aqui é o que a Fase 4 levaria para a página, sem runtime
 * a mais (o `sherpa-onnx-node` pediria outro export e um addon nativo só para a bancada).
 *
 * Decodificação: TDT gulosa, cópia fiel de `onnx_asr/asr.py::_AsrWithTransducerDecoding` +
 * `models/nemo.py::NemoConformerTdt` — a cada quadro do encoder, o joint devolve logits de token
 * (os `vocab` primeiros) e de DURAÇÃO (o resto); token ≠ blank avança o estado do preditor; a duração
 * pula quadros; no máximo 10 tokens por quadro. Sem feixe, sem LM: o que um celular roda.
 *
 * Idioma: o v3 detecta sozinho (25 línguas europeias, sem dica de idioma na entrada). A bancada
 * informa o idioma ao Whisper; aqui não há como — a diferença é do modelo e entra na medida.
 *
 * Modelos (CC-BY-4.0, revisões FIXADAS — trocar a revisão é trocar o modelo medido):
 *   v3-int8        istupakov/parakeet-tdt-0.6b-v3-onnx (quantização dinâmica int8 do export oficial)
 *   tagarela-int8  calneymgp/parakeet-tdt-0.6b-v3-ptBR-TAGARELA-onnx-int8 — int8 dinâmico de
 *                  alefiury/…-TAGARELA-onnx (ajuste fino em pt-BR). ATENÇÃO LEGAL: o modelo é
 *                  CC-BY-4.0, mas o dataset do ajuste (freds0/TAGARELA) é CC-BY-NC-SA-4.0 — uso
 *                  comercial pede parecer antes de ir para produção. Medir não é distribuir.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

import { baixarModelo } from './comum.mjs'

export const MODELOS_PARAKEET = {
  'v3-int8': { repo: 'istupakov/parakeet-tdt-0.6b-v3-onnx', rev: '8f23f0c03c8761650bdb5b40aaf3e40d2c15f1ce' },
  'tagarela-int8': {
    repo: 'calneymgp/parakeet-tdt-0.6b-v3-ptBR-TAGARELA-onnx-int8',
    rev: '7d84392553633a8e5bdca7eccb5ae25467e9572f',
  },
}
const ARQUIVOS = ['nemo128.onnx', 'vocab.txt', 'decoder_joint-model.int8.onnx', 'encoder-model.int8.onnx']
const MAX_TOKENS_POR_QUADRO = 10

/**
 * Junta as peças do SentencePiece como o `onnx-asr` (`DECODE_SPACE_PATTERN`): "▁" vira espaço; o
 * espaço só fica antes de caractere de palavra. O `\b` do JS é ASCII — "▁ção" perderia o espaço —,
 * por isso a classe Unicode explícita.
 */
export function destokenizar(pecas) {
  return pecas
    .join('')
    .replace(/\s(?![\p{L}\p{N}_])/gu, '')
    .replace(/^\s+/, '')
}

/**
 * Laço TDT guloso, isolado do ONNX para ser testável: `passo(ultimoToken, estado, t)` devolve
 * `{ logits (vocab), duracao, estado }`.
 */
export async function decodificarTdt(nQuadros, blank, passo, estadoInicial) {
  const tokens = []
  let estado = estadoInicial
  let t = 0
  let emitidos = 0
  while (t < nQuadros) {
    const r = await passo(tokens.length ? tokens.at(-1) : blank, estado, t)
    let token = 0
    for (let i = 1; i < r.logits.length; i++) if (r.logits[i] > r.logits[token]) token = i
    if (token !== blank) {
      estado = r.estado
      tokens.push(token)
      emitidos++
    }
    if (r.duracao > 0) {
      t += r.duracao
      emitidos = 0
    } else if (token === blank || emitidos === MAX_TOKENS_POR_QUADRO) {
      t++
      emitidos = 0
    }
  }
  return tokens
}

const exigir = createRequire(import.meta.url)
let carregado = null

export async function carregarParakeet(variante) {
  if (carregado?.variante === variante) return carregado
  const m = MODELOS_PARAKEET[variante]
  if (!m) throw new Error(`parakeet desconhecido: ${variante} (${Object.keys(MODELOS_PARAKEET).join(', ')})`)
  const caminhos = {}
  for (const arq of ARQUIVOS) {
    const url = `https://huggingface.co/${m.repo}/resolve/${m.rev}/${arq}`
    process.stdout.write(`\r  baixando/verificando ${m.repo}/${arq}…   `)
    // A revisão entra no caminho: trocar a revisão não reaproveita o arquivo velho do cache.
    caminhos[arq] = await baixarModelo(url, path.join('parakeet', variante, m.rev.slice(0, 12), arq))
  }
  // Libera o modelo anterior antes de subir o próximo: dois encoders de 0,6B não cabem juntos numa
  // máquina modesta.
  if (carregado) await Promise.all(Object.values(carregado.sessoes).map((s) => s.release?.()))
  carregado = null
  const ort = exigir('onnxruntime-node')
  // Um fio por sessão a mais do que o necessário só disputa CPU com o próprio laço; o encoder usa
  // todos os núcleos (RTF é medido na máquina inteira, como num notebook).
  const opcoes = { executionProviders: ['cpu'], graphOptimizationLevel: 'all', enableCpuMemArena: false }
  const sessoes = {
    pre: await ort.InferenceSession.create(caminhos['nemo128.onnx'], opcoes),
    enc: await ort.InferenceSession.create(caminhos['encoder-model.int8.onnx'], opcoes),
    joint: await ort.InferenceSession.create(caminhos['decoder_joint-model.int8.onnx'], {
      ...opcoes,
      intraOpNumThreads: 1,
    }),
  }
  const vocab = []
  for (const linha of readFileSync(caminhos['vocab.txt'], 'utf8').split('\n')) {
    if (!linha.trim()) continue
    const i = linha.lastIndexOf(' ')
    vocab[Number(linha.slice(i + 1))] = linha.slice(0, i).replaceAll('▁', ' ')
  }
  const blank = vocab.indexOf('<blk>')
  if (blank < 0) throw new Error('vocab sem <blk>')
  // Forma do estado do preditor (LSTM): [camadas, 1, oculto]. Os metadados dizem; 2×640 é o do v3.
  const meta = sessoes.joint.inputMetadata ?? []
  const forma = (nome, padrao) => {
    const d = meta.find?.((x) => x.name === nome)?.shape
    return Array.isArray(d) && typeof d[0] === 'number' && typeof d[2] === 'number' ? [d[0], 1, d[2]] : padrao
  }
  carregado = {
    variante,
    ort,
    sessoes,
    vocab,
    blank,
    formaEstado1: forma('input_states_1', [2, 1, 640]),
    formaEstado2: forma('input_states_2', [2, 1, 640]),
  }
  // Aquecimento (1 s de silêncio): a 1ª execução do ORT aloca e otimiza; não é custo por trecho.
  await transcreverParakeet(variante, new Float32Array(16000))
  return carregado
}

/** Transcreve PCM 16 kHz mono. Devolve o texto CRU (o filtro de alucinação é do chamador). */
export async function transcreverParakeet(variante, pcm) {
  const { ort, sessoes, vocab, blank, formaEstado1, formaEstado2 } = await carregarParakeet(variante)
  const { Tensor } = ort
  const pre = await sessoes.pre.run({
    waveforms: new Tensor('float32', pcm, [1, pcm.length]),
    waveforms_lens: new Tensor('int64', BigInt64Array.from([BigInt(pcm.length)]), [1]),
  })
  const enc = await sessoes.enc.run({ audio_signal: pre.features, length: pre.features_lens })
  const [, dim, quadros] = enc.outputs.dims
  const nQuadros = Math.min(quadros, Number(enc.encoded_lengths.data[0]))
  const saida = enc.outputs.data // [1, dim, quadros]: o quadro t é a coluna t
  const coluna = new Float32Array(dim)
  const zeros = (f) => new Tensor('float32', new Float32Array(f.reduce((a, b) => a * b, 1)), f)
  const nVocab = vocab.length
  const passo = async (ultimo, estado, t) => {
    for (let d = 0; d < dim; d++) coluna[d] = saida[d * quadros + t]
    const r = await sessoes.joint.run({
      encoder_outputs: new Tensor('float32', coluna, [1, dim, 1]),
      targets: new Tensor('int32', Int32Array.from([ultimo]), [1, 1]),
      target_length: new Tensor('int32', Int32Array.from([1]), [1]),
      input_states_1: estado[0],
      input_states_2: estado[1],
    })
    const o = r.outputs.data
    let duracao = 0
    for (let i = nVocab + 1; i < o.length; i++) if (o[i] > o[nVocab + duracao]) duracao = i - nVocab
    return { logits: o.subarray(0, nVocab), duracao, estado: [r.output_states_1, r.output_states_2] }
  }
  const tokens = await decodificarTdt(nQuadros, blank, passo, [zeros(formaEstado1), zeros(formaEstado2)])
  return destokenizar(tokens.map((t) => vocab[t]))
}
