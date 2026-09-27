/**
 * O ADAPTER OBEDECE AO PERFIL DO DISPOSITIVO: dtype/device da rota, threads do WASM e liberação
 * da memória ao sair da captura.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { esquecerAdaptadorWebGpu } from '../src/gateway/adaptadorWebGpu'
import { WhisperLocalStt } from '../src/gateway/adapters/whisperLocal'
import { WHISPER_MODELS } from '../src/gateway/sttRouter'

interface Msg {
  type: string
  id?: string
  model?: string
  dtype?: string
  device?: string
  threads?: number
}

let enviadas: Msg[] = []
const workers: WorkerFalso[] = []

class WorkerFalso {
  onmessage: ((m: MessageEvent) => void) | null = null
  onerror: ((e: ErrorEvent) => void) | null = null
  morto = false
  constructor() {
    workers.push(this)
  }
  responder(data: Record<string, unknown>) {
    queueMicrotask(() => !this.morto && this.onmessage?.({ data } as MessageEvent))
  }
  postMessage(msg: Msg) {
    enviadas.push(msg)
    if (msg.type === 'load') this.responder({ type: 'ready' })
    if (msg.type === 'transcribe') this.responder({ type: 'result', id: msg.id, text: 'ok' })
  }
  terminate() {
    this.morto = true
  }
}

const navegador = (extra: Record<string, unknown>) =>
  vi.stubGlobal('navigator', { userAgent: 'x', hardwareConcurrency: 8, maxTouchPoints: 0, ...extra })

beforeEach(() => {
  enviadas = []
  workers.length = 0
  esquecerAdaptadorWebGpu()
  vi.stubGlobal('Worker', WorkerFalso)
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined, removeItem: () => undefined })
})
afterEach(() => vi.unstubAllGlobals())

const cargas = () => enviadas.filter((m) => m.type === 'load')

describe('WhisperLocalStt × perfil do dispositivo', () => {
  it('rota q8/wasm chega ao worker como dtype q8 e device wasm', async () => {
    navegador({ gpu: { requestAdapter: async () => ({}) } })
    const stt = new WhisperLocalStt()
    stt.setModel(WHISPER_MODELS.base, { dtype: 'q8', device: 'wasm' })
    await stt.preload()
    expect(cargas()).toEqual([expect.objectContaining({ model: WHISPER_MODELS.base, dtype: 'q8', device: 'wasm' })])
  })

  it('sem crossOriginIsolated o worker recebe 1 thread', async () => {
    navegador({})
    vi.stubGlobal('crossOriginIsolated', false)
    const stt = new WhisperLocalStt()
    await stt.preload()
    expect(cargas()[0].threads).toBe(1)
  })

  it('isolado num desktop de 8 núcleos: 4 threads', async () => {
    navegador({ mediaDevices: { getDisplayMedia: () => undefined } })
    vi.stubGlobal('crossOriginIsolated', true)
    const stt = new WhisperLocalStt()
    await stt.preload()
    expect(cargas()[0].threads).toBe(4)
  })

  it('trocar só o dtype (híbrido → q8) recria o worker', async () => {
    navegador({})
    const stt = new WhisperLocalStt()
    stt.setModel(WHISPER_MODELS.base, { dtype: 'hybrid' })
    await stt.preload()
    stt.setModel(WHISPER_MODELS.base, { dtype: 'q8', device: 'wasm' })
    await stt.preload()
    expect(workers[0].morto).toBe(true)
    expect(cargas().map((m) => m.dtype)).toEqual(['hybrid', 'q8'])
  })

  it('liberar() encerra o worker; a próxima transcrição recarrega sozinha', async () => {
    navegador({})
    const stt = new WhisperLocalStt()
    await stt.preload()
    stt.liberar()
    expect(workers[0].morto).toBe(true)
    const r = await stt.transcribePcm(new Float32Array(160), 16000, { languageHint: 'pt' })
    expect(r.text).toBe('ok')
    expect(workers).toHaveLength(2)
    expect(cargas()).toHaveLength(2)
  })
})
