// @vitest-environment jsdom
/**
 * SE O VAD EM WORKER NÃO SOBE, A CAPTURA CAI NO `MicVAD` DA THREAD PRINCIPAL (o caminho de antes), com as
 * MESMAS opções (limiares, redenção, pré-pad, mínimo de fala) e os mesmos callbacks. Aqui o jsdom não tem
 * `AudioWorkletNode`, então o worker nem é tentado — o caso real de um navegador sem AudioWorklet.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const micVad = vi.hoisted(() => ({
  novo: vi.fn(async (_o: unknown) => ({ start: vi.fn(async () => undefined), pause: vi.fn(async () => undefined) })),
}))
vi.mock('@ricky0123/vad-web', () => ({ MicVAD: { new: micVad.novo } }))

import { startMicCapture } from '../src/gateway/capture/systemAudio'

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
  micVad.novo.mockClear()
  ;(globalThis as unknown as { MediaRecorder: unknown }).MediaRecorder = FakeRecorder
})

describe('fallback do VAD para a thread principal', () => {
  it('sem AudioWorklet, usa o MicVAD com os limiares de sempre e a captura abre', async () => {
    const faixa = { enabled: true, stop: vi.fn(), addEventListener: vi.fn() }
    const stream = { getAudioTracks: () => [faixa], getTracks: () => [faixa] } as unknown as MediaStream
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn(async () => stream) },
    })
    const captura = await startMicCapture(undefined, {
      onUtterance: vi.fn(),
      onStatus: vi.fn(),
      onError: vi.fn(),
    } as never)
    expect(micVad.novo).toHaveBeenCalledTimes(1)
    const o = micVad.novo.mock.calls[0][0] as Record<string, unknown>
    expect(o).toMatchObject({
      model: 'legacy',
      positiveSpeechThreshold: 0.5,
      negativeSpeechThreshold: 0.35,
      redemptionMs: 800,
      preSpeechPadMs: 300,
      minSpeechMs: 400,
      submitUserSpeechOnPause: true,
      baseAssetPath: '/',
    })
    for (const cb of ['onSpeechStart', 'onFrameProcessed', 'onVADMisfire', 'onSpeechEnd'])
      expect(typeof o[cb]).toBe('function')
    await captura.stop()
  })
})
