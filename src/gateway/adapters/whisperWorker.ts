/**
 * Web Worker — pipeline ASR (Whisper local), espelho do whisper-server do desktop
 * mas executando off-thread no navegador.
 *
 * Backend PADRÃO = WASM (roda em QUALQUER navegador — Chrome, Edge, Firefox, Safari, celular —
 * e, para modelos pequenos como o whisper-tiny, é medido como MAIS RÁPIDO que WebGPU: o overhead
 * de dispatch da GPU domina em modelos pequenos; ref.: transformers.js issue #894). WebGPU fica
 * opcional via `device: 'webgpu'`. Isso torna a transcrição local UNIVERSAL (antes: só WebGPU).
 *
 * Recebe mensagens { type: 'load' | 'transcribe', ... } e responde com progresso +
 * resultados via postMessage.
 */
import { pipeline, env, TextStreamer } from '@huggingface/transformers'
import { configureModelDelivery } from './transformersEnv'
import { criarRastreadorDeProgresso, rotuloDeBytes } from './modelProgress'
import { registrarModeloBaixado } from '../modelManifest'

// Entrega dos pesos: cache do navegador (padrão) ou self-host same-origin (VITE_SELF_HOST_MODELS).
configureModelDelivery()

// Threads do runtime WASM do ONNX. Multithread exige SharedArrayBuffer → página cross-origin
// isolada (COOP/COEP). SEM isolamento, o ort cai graciosamente para 1 thread (mais lento, porém
// FUNCIONA). SIMD funciona sem isolamento. Limitamos as threads p/ não saturar a máquina.
try {
  const cores = (self as any).navigator?.hardwareConcurrency || 4
  env.backends.onnx.wasm.simd = true
  env.backends.onnx.wasm.numThreads = Math.max(1, Math.min(cores, 4))
} catch {
  // ambiente sem esses campos — ignora (usa defaults do runtime)
}

/**
 * Normaliza o device pedido pelo adapter.
 * `auto` (PADRÃO) = WebGPU se o navegador tiver (decode MEDIDO ~0,48s vs ~5,2s no WASM
 * single-thread nesta classe de hardware) senão WASM (universal — Firefox/Safari/celular).
 * Sem COOP/COEP o WASM roda em 1 thread e é lento; então onde há WebGPU, ele ganha. O WASM
 * continua sendo o fallback que garante transcrição local em QUALQUER navegador.
 */
function resolveDevice(device?: string): 'wasm' | 'webgpu' {
  if (device === 'webgpu') return 'webgpu'
  if (device === 'wasm') return 'wasm'
  const hasWebGpu = !!(self as any).navigator?.gpu
  return hasWebGpu ? 'webgpu' : 'wasm'
}

let asr: any = null
let asrModel = ''

// Modelo padrão: whisper-TINY. Cada decode do Whisper processa uma janela interna fixa de
// 30s, então o custo é ~constante por chamada — e o tiny tem esse custo ~4× menor que o base.
// Em áudio contínuo (vídeo/2x), isso é o que faz o decode ser < a duração do trecho e a fila
// DRENAR (senão a latência acumula até dezenas de segundos). O adapter pode passar outro id
// no 'load' (ex.: 'onnx-community/whisper-base' p/ mais precisão).
const DEFAULT_MODEL = 'onnx-community/whisper-tiny'

// dtype padrão HÍBRIDO: o ENCODER do Whisper é sensível a quantização (q8 degrada e propaga
// erro por todo o decode), mas o DECODER tolera bem 4-bit. Então: encoder em precisão alta +
// decoder em q4 → decode mais rápido E mais preciso que o q8 uniforme anterior.
// (Ref.: docs Transformers.js + demo realtime-whisper-webgpu.)
const DTYPE_PRESETS: Record<string, any> = {
  hybrid: { encoder_model: 'fp32', decoder_model_merged: 'q4' },
  'hybrid-fp16': { encoder_model: 'fp16', decoder_model_merged: 'q4' },
  q8: 'q8',
  q4: 'q4',
  fp16: 'fp16',
  fp32: 'fp32',
}

/**
 * Progresso: a lib JÁ agrega por bytes reais e pré-semeia o denominador com TODOS os arquivos
 * antes do primeiro byte. O agregador caseiro que existia aqui descartava esse agregado (exigia
 * `info.file`, que `progress_total` não tem) e travava a barra em 100% assim que os JSON pequenos
 * terminavam — medido: 100% aos 8,75 s com 8,48 MB de ~146 MB baixados. Ver
 * docs/discovery/A-model-download.md (A-P0-1) e tests/modelProgress.test.ts.
 *
 * Estado POR CARGA (era global de módulo e nunca resetado: a 2ª carga nascia travada em 100%).
 */
function novoProgresso(rotulo: string) {
  // Guarda o total agregado que a lib informou. É o que o manifesto usa como `bytesEsperados`:
  // sem ele, uma gravação parcial no cache (quota) produzia um manifesto que se descrevia como
  // completo. Achado pela suíte de mecanismo (cenário 11).
  let bytesEsperados = 0
  const rastrear = criarRastreadorDeProgresso((p) => {
    if (p.total > 0) bytesEsperados = p.total
    self.postMessage({
      type: 'progress',
      progress: p.progress,
      loaded: p.loaded,
      total: p.total,
      label: rotuloDeBytes(p.loaded, p.total) ?? rotulo,
    })
  })
  return Object.assign(rastrear, { get bytesEsperados() { return bytesEsperados } })
}

/**
 * Cria o pipeline ASR (lazy) no device pedido (default WASM). Tenta o dtype pedido; se o repo
 * não tiver esses arquivos, cai para q8. Depois faz WARMUP para o 1º decode real não pagar o
 * stall de compilação/JIT (em WebGPU chegava a ~13s compilando shaders; em WASM aquece o JIT).
 */
async function ensurePipeline(model?: string, dtypeKey?: string, device?: string): Promise<void> {
  if (asr) return
  asrModel = model || DEFAULT_MODEL
  const dev = resolveDevice(device)
  const wantDtype = DTYPE_PRESETS[dtypeKey || 'hybrid'] ?? DTYPE_PRESETS.hybrid

  let dtypeEfetivo = dtypeKey || 'hybrid'
  let progresso = novoProgresso('Whisper')
  try {
    asr = await pipeline('automatic-speech-recognition', asrModel, {
      device: dev,
      dtype: wantDtype,
      progress_callback: progresso,
    })
  } catch (err) {
    dtypeEfetivo = 'q8'
    // Fallback robusto: repo sem os arquivos do dtype híbrido → usa q8 (no mesmo device).
    // Rastreador NOVO: o dtype mudou, logo os arquivos e o total mudaram. Reaproveitar o anterior
    // faria a barra nascer no percentual da tentativa que falhou.
    console.warn('[whisper:worker] dtype', wantDtype, 'indisponível no repo — caindo para q8:', String((err as Error)?.message || err).slice(0, 120))
    self.postMessage({ type: 'progress', progress: 0, loaded: 0, total: 0, label: 'usando formato alternativo (q8)…' })
    progresso = novoProgresso('Whisper (q8)')
    asr = await pipeline('automatic-speech-recognition', asrModel, {
      device: dev,
      dtype: 'q8',
      progress_callback: progresso,
    })
  }

  // Manifesto: só agora existe verdade a gravar — o modelo carregou, com ESTE dtype e ESTE device.
  // É o que permite a UI responder "já está completo?" sem chutar (A-P0-4).
  void registrarModeloBaixado(asrModel, dtypeEfetivo, dev, progresso.bytesEsperados)

  // WARMUP: a 1ª inferência compila shaders (WebGPU) / aquece o JIT (WASM) do laço de decode.
  // Precisa gerar VÁRIOS tokens (não 1) p/ compilar o passo autoregressivo — senão a primeira
  // transcrição real ainda paga o stall. Rodar em silêncio agora esconde isso no "carregando".
  try {
    await asr(new Float32Array(16000), { language: 'en', task: 'transcribe', return_timestamps: false, num_beams: 1, do_sample: false, max_new_tokens: 8 })
  } catch {
    // warmup é best-effort
  }
}

/**
 * Processa mensagens do adapter.
 */
self.onmessage = async (e: MessageEvent) => {
  const { type, id, pcm, language, model, dtype, device, maxNewTokens } = e.data

  try {
    if (type === 'load') {
      await ensurePipeline(model, dtype, device)
      self.postMessage({ type: 'ready' })
    } else if (type === 'transcribe') {
      await ensurePipeline(model, dtype, device)

      // STREAMING token-a-token: em vez de só entregar o texto ao FIM do decode, emitimos
      // mensagens `update` incrementais conforme os tokens saem — a UI vê o texto crescendo
      // durante a fala (sensação de tempo real). Acumulamos aqui e postamos o texto-até-agora.
      // (Padrão do exemplo oficial realtime-whisper-webgpu.)
      let acc = ''
      const streamer = new TextStreamer(asr.tokenizer, {
        skip_prompt: true,
        skip_special_tokens: true,
        callback_function: (t: string) => {
          acc += t
          self.postMessage({ type: 'update', id, text: acc.trim() })
        },
      })

      // TETO DINÂMICO de tokens (anti-alucinação): o Whisper, em silêncio/pausa ou em buffer
      // curto, "continua inventando" até bater o max_new_tokens. Limitar à DURAÇÃO real do áudio
      // (~15 tokens/s é folgado p/ fala — a real mede ~3/s) corta a geração desenfreada sem
      // cortar fala legítima. Ex.: parcial de 1s → 15 tokens; trecho de 6s → 90 (< teto de 128).
      const audioSec = pcm.length / 16000
      const hardCap = maxNewTokens || 128
      const dynMax = Math.max(8, Math.min(hardCap, Math.round(audioSec * 15)))

      // Decode enxuto p/ baixa latência: greedy (sem beam), cache ligado (implícito no grafo
      // merged), idioma FIXO (pula auto-detecção e evita "traduzir" sozinho), sem timestamps.
      // no_repeat_ngram_size + repetition_penalty MATAM os loops de repetição (palavras repetidas),
      // a assinatura clássica de alucinação do Whisper em decode greedy sem essas travas.
      const out = await asr(pcm, {
        language: language || undefined,
        task: 'transcribe',
        return_timestamps: false,
        num_beams: 1,
        do_sample: false,
        max_new_tokens: dynMax,
        no_repeat_ngram_size: 3,
        repetition_penalty: 1.15,
        streamer,
      })

      self.postMessage({
        type: 'result',
        id,
        text: (out.text ?? '').trim(),
      })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    self.postMessage({
      type: 'error',
      id: id ?? null,
      message,
    })
  }
}
