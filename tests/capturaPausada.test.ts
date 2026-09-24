// @vitest-environment jsdom
/**
 * "PARAR" ABRE O ENCERRAR COM A GRAVAÇÃO AINDA DE PÉ (protótipo, C8).
 *
 * O Parar deixou de encerrar as fontes: ele PAUSA a captura e abre o diálogo. "Continuar gravando"
 * retoma a MESMA captura. Parar de verdade e recomeçar tinha dois defeitos:
 *
 *   · o compartilhamento de tela era pedido de novo (o getDisplayMedia exige outro gesto);
 *   · o áudio de antes do Parar se perdia: `stop()` devolve UM blob, e o recomeço produzia outro,
 *     que sobrescrevia o primeiro no que é salvo.
 *
 * Estes testes prendem o contrato de `setPaused`: o gravador pausa e retoma (um blob só), a faixa
 * continua viva, o VAD pausa ENTREGANDO a frase em curso e volta a ouvir ao retomar.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const vadFalso = { start: vi.fn(), pause: vi.fn(), destroy: vi.fn() }
const opcoesDoVad: { submitUserSpeechOnPause?: boolean } = {}
vi.mock('@ricky0123/vad-web', () => ({
  MicVAD: {
    new: vi.fn(async (op: { submitUserSpeechOnPause?: boolean }) => {
      opcoesDoVad.submitUserSpeechOnPause = op.submitUserSpeechOnPause
      return vadFalso
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
  pause() {
    this.state = 'paused'
  }
  resume() {
    this.state = 'recording'
  }
  stop() {
    this.state = 'inactive'
    this.onstop?.()
  }
}

async function capturaAberta() {
  const faixa = { enabled: true, stop: vi.fn(), addEventListener: vi.fn() }
  const stream = { getAudioTracks: () => [faixa], getTracks: () => [faixa] } as unknown as MediaStream
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn(async () => stream) },
  })
  const captura = await startMicCapture(undefined, { onUtterance: vi.fn() } as never)
  return { captura, faixa }
}

beforeEach(() => {
  FakeRecorder.ultima = null
  vadFalso.start.mockClear()
  vadFalso.pause.mockClear()
  ;(globalThis as unknown as { MediaRecorder: unknown }).MediaRecorder = FakeRecorder
})

describe('pausa da captura (Parar → Encerrar → Continuar gravando)', () => {
  it('pausar pausa o gravador e o VAD, e mantém a faixa viva', async () => {
    const { captura, faixa } = await capturaAberta()
    captura.setPaused(true)
    expect(FakeRecorder.ultima?.state).toBe('paused')
    expect(vadFalso.pause).toHaveBeenCalledTimes(1)
    expect(faixa.stop).not.toHaveBeenCalled()
    expect(faixa.enabled).toBe(true)
    await captura.stop()
  })

  it('a frase em curso é ENTREGUE na pausa, não descartada', async () => {
    await capturaAberta()
    expect(opcoesDoVad.submitUserSpeechOnPause).toBe(true)
  })

  it('retomar volta o MESMO gravador e o VAD, sem abrir outra captura', async () => {
    const { captura } = await capturaAberta()
    const gravador = FakeRecorder.ultima
    const pedidos = (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mock.calls.length
    const inicios = vadFalso.start.mock.calls.length
    captura.setPaused(true)
    captura.setPaused(false)
    expect(FakeRecorder.ultima).toBe(gravador)
    expect(gravador?.state).toBe('recording')
    expect(vadFalso.start.mock.calls.length).toBe(inicios + 1)
    expect((navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mock.calls.length).toBe(pedidos)
    await captura.stop()
  })

  it('parar de dentro da pausa ainda fecha o gravador (salvar a partir do Encerrar)', async () => {
    const { captura } = await capturaAberta()
    captura.setPaused(true)
    await captura.stop()
    expect(FakeRecorder.ultima?.state).toBe('inactive')
  })

  it('pedir o mesmo estado duas vezes não faz nada', async () => {
    const { captura } = await capturaAberta()
    captura.setPaused(true)
    captura.setPaused(true)
    expect(vadFalso.pause).toHaveBeenCalledTimes(1)
    captura.setPaused(false)
    captura.setPaused(false)
    expect(FakeRecorder.ultima?.state).toBe('recording')
    await captura.stop()
  })
})
