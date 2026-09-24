// @vitest-environment jsdom
/**
 * SE O DETECTOR DE FALA NÃO SOBE, A CAPTURA NÃO PODE FICAR MEIO ABERTA.
 *
 * Bug real (24/09/2026): numa instalação sem o `postinstall`, `/silero_vad_legacy.onnx` dava 404
 * e o `MicVAD.new` rejeitava com "no available backend found…". `startCaptureFromStream` já tinha
 * ligado o MediaRecorder, a sonda de nível e o compartilhamento de tela — e não desfazia nada. O
 * dono via o botão voltar a "Iniciar captura", a barra "compartilhando sua tela" continuar ativa, e
 * 2,5 s depois um aviso de "faixa SILENCIOSA" vindo da sonda órfã, que o mandava procurar o
 * problema no lugar errado.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@ricky0123/vad-web', () => ({
  MicVAD: {
    new: vi.fn(async () => {
      throw new Error('no available backend found. ERR: [wasm] TypeError: Failed to fetch dynamically imported module')
    }),
  },
}))

import { startMicCapture } from '../src/gateway/capture/systemAudio'

class FakeRecorder {
  static ultima: FakeRecorder | null = null
  static isTypeSupported = () => true
  state = 'inactive'
  ondataavailable: ((e: unknown) => void) | null = null
  onstop: (() => void) | null = null
  start() {
    this.state = 'recording'
    FakeRecorder.ultima = this
  }
  stop() {
    this.state = 'inactive'
    this.onstop?.()
  }
}

beforeEach(() => {
  FakeRecorder.ultima = null
  ;(globalThis as unknown as { MediaRecorder: unknown }).MediaRecorder = FakeRecorder
})

describe('falha ao criar o detector de fala', () => {
  it('fecha gravador e faixa, e explica a causa em vez de repassar o erro do ONNX', async () => {
    const faixa = { enabled: true, stop: vi.fn(), addEventListener: vi.fn() }
    const stream = { getAudioTracks: () => [faixa], getTracks: () => [faixa] } as unknown as MediaStream
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn(async () => stream) },
    })
    const onStatus = vi.fn()
    const onError = vi.fn()

    await expect(startMicCapture(undefined, { onUtterance: vi.fn(), onStatus, onError } as never)).rejects.toThrow(
      /detector de fala/,
    )

    expect(FakeRecorder.ultima?.state).toBe('inactive')
    expect(faixa.stop).toHaveBeenCalled()
    expect(onError).toHaveBeenCalledTimes(1)
  })
})
