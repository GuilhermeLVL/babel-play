// @vitest-environment jsdom
/**
 * O VAD RODA NUMA THREAD SÓ (plano "Grátis sem travar", A3).
 *
 * O Silero do vad-web roda o ONNX NA THREAD PRINCIPAL. Sem `ortConfig`, o ORT dele ficava no padrão
 * (`min(4, ⌈núcleos/2⌉)` com isolamento): abria workers de pthread para um modelo de 1,7 MB avaliado a
 * cada 96 ms, e a thread principal — que não pode bloquear — esperava por eles girando, no lugar da
 * interface. Agora os dois VADs (o ao vivo e o da importação) pedem 1 thread.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const opcoes = vi.hoisted(() => ({ micVad: null as any, naoTempoReal: null as any }))

vi.mock('@ricky0123/vad-web', () => ({
  MicVAD: {
    new: vi.fn(async (o: unknown) => {
      opcoes.micVad = o
      throw new Error('parar aqui: só interessam as opções')
    }),
  },
  NonRealTimeVAD: {
    new: vi.fn(async (o: unknown) => {
      opcoes.naoTempoReal = o
      throw new Error('parar aqui: só interessam as opções')
    }),
  },
}))
vi.mock('../src/gateway/adapters/whisperLocal', () => ({ WhisperLocalStt: vi.fn() }))

import { startMicCapture } from '../src/gateway/capture/systemAudio'
import { offlineTranscribe } from '../src/gateway/offlineTranscribe'

const ortFalso = () => ({
  env: { logLevel: 'warning', wasm: { numThreads: 4, simd: false } as Record<string, unknown> },
})

class FakeRecorder {
  static isTypeSupported = () => true
  state = 'inactive'
  ondataavailable: ((e: unknown) => void) | null = null
  onstop: (() => void) | null = null
  start() {
    this.state = 'recording'
  }
  stop() {
    this.state = 'inactive'
    this.onstop?.()
  }
}

beforeEach(() => {
  opcoes.micVad = null
  opcoes.naoTempoReal = null
  ;(globalThis as unknown as { MediaRecorder: unknown }).MediaRecorder = FakeRecorder
})

describe('ortConfig do VAD', () => {
  it('ao vivo (MicVAD): 1 thread, SIMD, e o logLevel de sempre do vad-web', async () => {
    const faixa = { enabled: true, stop: vi.fn(), addEventListener: vi.fn() }
    const stream = { getAudioTracks: () => [faixa], getTracks: () => [faixa] } as unknown as MediaStream
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn(async () => stream) },
    })
    await startMicCapture(undefined, { onUtterance: vi.fn(), onStatus: vi.fn(), onError: vi.fn() } as never).catch(
      () => undefined,
    )
    expect(typeof opcoes.micVad?.ortConfig).toBe('function')
    const ort = ortFalso()
    opcoes.micVad.ortConfig(ort)
    expect(ort.env.wasm.numThreads).toBe(1)
    expect(ort.env.wasm.simd).toBe(true)
    expect(ort.env.logLevel).toBe('error')
    // O caminho dos binários continua o do próprio domínio (o vad-web o põe antes do ortConfig).
    expect(opcoes.micVad.onnxWASMBasePath).toBe('/')
  })

  it('importação (NonRealTimeVAD): 1 thread, e os binários do próprio domínio', async () => {
    ;(window as unknown as { AudioContext: unknown }).AudioContext = class {
      async decodeAudioData() {
        return { sampleRate: 16000, numberOfChannels: 1, length: 16000, getChannelData: () => new Float32Array(16000) }
      }
      close() {
        return Promise.resolve()
      }
    }
    await offlineTranscribe(new Blob([new Uint8Array(4)]), { languageHint: 'pt' }).catch(() => undefined)
    expect(typeof opcoes.naoTempoReal?.ortConfig).toBe('function')
    const ort = ortFalso()
    opcoes.naoTempoReal.ortConfig(ort)
    expect(ort.env.wasm.numThreads).toBe(1)
    expect(ort.env.wasm.simd).toBe(true)
    expect(ort.env.wasm.wasmPaths).toBe('/')
  })

  it('um ort sem os campos não derruba a captura', async () => {
    const { ortDoVadNumaThread } = await import('../src/lib/dispositivo/orcamentoDeThreads')
    expect(() => ortDoVadNumaThread({} as never)).not.toThrow()
  })
})
