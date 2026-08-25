/**
 * WORKER DE IMPRESSÃO DE VOZ — WeSpeaker ResNet34 (6,7MB quantizado) via transformers.js.
 *
 * Recebe o PCM 16kHz de um enunciado e devolve o embedding (256 dims) que caracteriza a VOZ
 * (não o conteúdo). O agrupamento em "Pessoa 1/2/3" acontece no cliente (speakerCluster.ts).
 *
 * Sempre WASM: o modelo é minúsculo (~100ms/enunciado) e o WebGPU fica livre para o Whisper —
 * zero disputa com a transcrição. Mesma entrega de pesos dos outros workers (self-host/cache).
 */
import { AutoProcessor, AutoModel, env } from '@huggingface/transformers'
import { configureModelDelivery } from '../gateway/adapters/transformersEnv'

configureModelDelivery()
try {
  env.backends.onnx.wasm.simd = true
  // 1 thread basta (modelo pequeno) e não briga com os threads do Whisper WASM.
  env.backends.onnx.wasm.numThreads = 1
} catch { /* defaults */ }

const MODEL_ID = 'onnx-community/wespeaker-voxceleb-resnet34-LM'

let processor: any = null
let model: any = null
let loading: Promise<void> | null = null

function ensureLoaded(): Promise<void> {
  if (processor && model) return Promise.resolve()
  if (!loading) {
    loading = (async () => {
      processor = await AutoProcessor.from_pretrained(MODEL_ID)
      model = await AutoModel.from_pretrained(MODEL_ID, { dtype: 'q8', device: 'wasm' })
    })().catch((e) => {
      loading = null // permite retry num próximo pedido
      throw e
    })
  }
  return loading
}

/** Reamostragem linear best-effort → 16kHz (o VAD já entrega 16k; isto é cinto de segurança). */
function to16k(pcm: Float32Array, sr: number): Float32Array {
  if (sr === 16000) return pcm
  const ratio = sr / 16000
  const out = new Float32Array(Math.floor(pcm.length / ratio))
  for (let i = 0; i < out.length; i++) {
    const pos = i * ratio
    const i0 = Math.floor(pos)
    const frac = pos - i0
    out[i] = pcm[i0] * (1 - frac) + (pcm[Math.min(i0 + 1, pcm.length - 1)] ?? 0) * frac
  }
  return out
}

self.onmessage = async (e: MessageEvent) => {
  const { type, id, pcm, sr } = e.data as { type: string; id: number; pcm?: Float32Array; sr?: number }
  try {
    if (type === 'load') {
      await ensureLoaded()
      self.postMessage({ type: 'loaded', id })
      return
    }
    if (type === 'embed') {
      await ensureLoaded()
      const audio = to16k(pcm as Float32Array, sr || 16000)
      const inputs = await processor(audio)
      const out = await model(inputs)
      // Saída única do WeSpeaker: 'last_hidden_state' [1, 256] (verificado no sanity check).
      const tensor = out[Object.keys(out)[0]]
      const embedding = Float32Array.from(tensor.data as Float32Array)
      ;(self as any).postMessage({ type: 'embedding', id, embedding }, [embedding.buffer])
      return
    }
  } catch (err) {
    self.postMessage({ type: 'error', id, error: String((err as Error)?.message ?? err) })
  }
}
