/**
 * NUNCA SEM LEGENDA POR CAUSA DA GPU (auditoria de latência 2026-09-26, P0).
 *
 * Medido: headless com `navigator.gpu` e sem adaptador → o small ia para o WebGPU, o worker falhava
 * com "no available backend found", a preparação terminava em erro e as falas ficavam guardadas para
 * sempre. E quando o WebGPU caía, o fallback recriava o SMALL em WASM (18,6 s por legenda).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { esquecerAdaptadorWebGpu } from '../src/gateway/adaptadorWebGpu'
import { WhisperLocalStt } from '../src/gateway/adapters/whisperLocal'
import type { AvisoDeDegradacaoDoStt } from '../src/gateway/capabilities'
import { WHISPER_MODELS } from '../src/gateway/sttRouter'

interface Msg {
  type: string
  id?: string
  model?: string
  device?: string
  prioridade?: string
}

let enviadas: Msg[] = []
/** Como o worker falso responde a uma carga. */
let aoCarregar: (msg: Msg, w: WorkerFalso) => void
/** Como responde a um decode (padrão: resultado na hora). */
let aoTranscrever: (msg: Msg, w: WorkerFalso) => void
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
    if (msg.type === 'load') aoCarregar(msg, this)
    if (msg.type === 'transcribe') aoTranscrever(msg, this)
    if (msg.type === 'cancelar') this.responder({ type: 'cancelado', id: msg.id })
  }
  terminate() {
    this.morto = true
  }
}

const comGpu = (adaptador: unknown) =>
  vi.stubGlobal('navigator', { ...globalThis.navigator, gpu: { requestAdapter: async () => adaptador } })

beforeEach(() => {
  enviadas = []
  workers.length = 0
  esquecerAdaptadorWebGpu()
  vi.stubGlobal('Worker', WorkerFalso)
  aoCarregar = (_m, w) => w.responder({ type: 'ready' })
  aoTranscrever = (m, w) => w.responder({ type: 'result', id: m.id, text: 'ok' })
})
afterEach(() => vi.unstubAllGlobals())

const cargas = () => enviadas.filter((m) => m.type === 'load').map((m) => `${m.model?.split('-').pop()}@${m.device}`)

describe('WhisperLocalStt: GPU que não serve', () => {
  it('navigator.gpu SEM adaptador (headless) e o small pedido: carrega o BASE em WASM e avisa', async () => {
    comGpu(null)
    const avisos: AvisoDeDegradacaoDoStt[] = []
    const stt = new WhisperLocalStt()
    stt.setModel(WHISPER_MODELS.small)
    await stt.preload(undefined, { aoDegradar: (a) => avisos.push(a) })
    expect(cargas()).toEqual(['base@wasm'])
    expect(avisos).toHaveLength(1)
    expect(avisos[0]).toMatchObject({
      motivo: 'sem-gpu',
      modeloAntes: WHISPER_MODELS.small,
      modelo: WHISPER_MODELS.base,
    })
  })

  it('com adaptador: small no WebGPU, sem aviso', async () => {
    comGpu({})
    const avisos: AvisoDeDegradacaoDoStt[] = []
    const stt = new WhisperLocalStt()
    stt.setModel(WHISPER_MODELS.small)
    await stt.preload(undefined, { aoDegradar: (a) => avisos.push(a) })
    expect(cargas()).toEqual(['small@webgpu'])
    expect(avisos).toHaveLength(0)
  })

  it('a carga no WebGPU FALHA ("no available backend found"): recarrega sozinha em WASM com o base e a preparação RESOLVE', async () => {
    comGpu({})
    aoCarregar = (m, w) =>
      w.responder(
        m.device === 'webgpu'
          ? { type: 'error', id: null, message: 'no available backend found. ERR: [webgpu] …' }
          : { type: 'ready' },
      )
    const avisos: AvisoDeDegradacaoDoStt[] = []
    const stt = new WhisperLocalStt()
    stt.setModel(WHISPER_MODELS.small)
    await expect(stt.preload(undefined, { aoDegradar: (a) => avisos.push(a) })).resolves.toBeUndefined()
    expect(cargas()).toEqual(['small@webgpu', 'base@wasm'])
    expect(avisos.map((a) => a.motivo)).toEqual(['sem-gpu'])
    // E transcreve: nenhuma fala fica represada.
    await expect(stt.transcribePcm(new Float32Array(1600), 16000, { languageHint: 'pt' })).resolves.toMatchObject({
      text: 'ok',
    })
  })

  it('queda de GPU em RUNTIME: a próxima carga é o BASE em WASM (não o small em WASM)', async () => {
    comGpu({})
    aoTranscrever = (m, w) =>
      w.responder(
        m.device === 'webgpu'
          ? { type: 'error', id: m.id, message: 'WebGPU device lost' }
          : { type: 'result', id: m.id, text: 'ok' },
      )
    const stt = new WhisperLocalStt()
    stt.setModel(WHISPER_MODELS.small)
    await stt.preload()
    await expect(stt.transcribePcm(new Float32Array(1600), 16000, { languageHint: 'pt' })).rejects.toThrow(
      /device lost/,
    )
    await expect(stt.transcribePcm(new Float32Array(1600), 16000, { languageHint: 'pt' })).resolves.toMatchObject({
      text: 'ok',
    })
    expect(cargas()).toEqual(['small@webgpu', 'base@wasm'])
    // O roteador ainda pede o small na próxima sessão: fica o base, a GPU já provou que não serve.
    stt.setModel(WHISPER_MODELS.small)
    expect(stt.modeloAtual).toBe(WHISPER_MODELS.base)
  })

  it('quem força `wasm` à mão recebe o que pediu (medição), sem troca de modelo', async () => {
    comGpu(null)
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => (k === 'babel.whisperDevice' ? 'wasm' : null),
      setItem() {},
    })
    const stt = new WhisperLocalStt()
    stt.setModel(WHISPER_MODELS.small)
    await stt.preload()
    expect(cargas()).toEqual(['small@wasm'])
  })
})

describe('WhisperLocalStt: parcial e final', () => {
  it('parcial vai com prioridade `parcial`; final com `final`', async () => {
    comGpu({})
    const stt = new WhisperLocalStt()
    stt.setModel(WHISPER_MODELS.small)
    await stt.preload()
    await stt.transcribeIfIdle(new Float32Array(1600), 16000, { languageHint: 'pt' })
    await stt.transcribePcm(new Float32Array(1600), 16000, { languageHint: 'pt' })
    expect(enviadas.filter((m) => m.type === 'transcribe').map((m) => m.prioridade)).toEqual(['parcial', 'final'])
  })

  it('parcial que o worker cancela resolve `null` e libera o adapter (nada fica "ocupado" para sempre)', async () => {
    comGpu({})
    aoTranscrever = (m, w) =>
      w.responder(
        m.prioridade === 'parcial' ? { type: 'cancelado', id: m.id } : { type: 'result', id: m.id, text: 'ok' },
      )
    const stt = new WhisperLocalStt()
    stt.setModel(WHISPER_MODELS.small)
    await stt.preload()
    await expect(stt.transcribeIfIdle(new Float32Array(1600), 16000, { languageHint: 'pt' })).resolves.toBeNull()
    expect(stt.busy).toBe(false)
  })

  it('final com `signal` abortado: pede `cancelar` ao worker e rejeita com AbortError', async () => {
    comGpu({})
    aoTranscrever = () => {} // fica em voo
    const stt = new WhisperLocalStt()
    stt.setModel(WHISPER_MODELS.small)
    await stt.preload()
    const ctl = new AbortController()
    const p = stt.transcribePcm(new Float32Array(1600), 16000, { languageHint: 'pt', signal: ctl.signal })
    await new Promise((r) => setTimeout(r, 0))
    ctl.abort()
    await expect(p).rejects.toMatchObject({ name: 'AbortError' })
    expect(enviadas.some((m) => m.type === 'cancelar')).toBe(true)
    expect(stt.busy).toBe(false)
  })
})
