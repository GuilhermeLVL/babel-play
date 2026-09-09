// @vitest-environment jsdom
/**
 * MUTAR O MICROFONE NÃO PODE PARAR A GRAVAÇÃO.
 *
 * O microfone virou um interruptor alternável DURANTE a sessão. A implementação óbvia — parar a
 * captura ao mutar e criar outra ao desmutar — quebra duas coisas de um jeito que nenhuma tela
 * denuncia na hora:
 *
 *   · cada `stop()` fecha o MediaRecorder e devolve UM blob. Alternar três vezes produziria três
 *     blobs, e `handleStopRecording` só sabe misturar um: o áudio das partes anteriores sumiria
 *     do que é salvo, e a pessoa só descobriria ao tentar se reescutar depois;
 *   · cada reinício move o `startedAtMs`, que é a âncora do relógio das legendas — elas
 *     descolariam do áudio por um offset diferente a cada alternância.
 *
 * Por isso `setMuted` desabilita a FAIXA e deixa tudo o mais de pé. Estes testes prendem
 * exatamente isso: a faixa muda, o gravador não.
 */
import { beforeEach,describe, expect, it, vi } from 'vitest'

vi.mock('@ricky0123/vad-web', () => ({
  MicVAD: { new: vi.fn(async () => ({ start: vi.fn(), pause: vi.fn(), destroy: vi.fn() })) },
}))

import { startMicCapture } from '../src/gateway/capture/systemAudio'

class FakeRecorder {
  /** A última instância criada — em propriedade estática, não numa variável solta:
   *  `gravador = this` cai na regra `no-this-alias` do projeto. */
  static ultima: FakeRecorder | null = null
  static isTypeSupported = () => true
  state = 'inactive'
  ondataavailable: ((e: unknown) => void) | null = null
  onstop: (() => void) | null = null
  start() { this.state = 'recording'; FakeRecorder.ultima = this }
  stop() { this.state = 'inactive'; this.onstop?.() }
}

function faixaFalsa() {
  return { enabled: true, stop: vi.fn(), addEventListener: vi.fn() }
}

async function capturaAberta() {
  const faixa = faixaFalsa()
  const stream = {
    getAudioTracks: () => [faixa],
    getTracks: () => [faixa],
  } as unknown as MediaStream
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn(async () => stream) },
  })
  const captura = await startMicCapture(undefined, { onUtterance: vi.fn() } as never)
  return { captura, faixa }
}

beforeEach(() => {
  FakeRecorder.ultima = null
  ;(globalThis as unknown as { MediaRecorder: unknown }).MediaRecorder = FakeRecorder
})

describe('mudo do microfone', () => {
  it('desabilita a faixa e MANTÉM o gravador rodando', async () => {
    const { captura, faixa } = await capturaAberta()
    expect(faixa.enabled).toBe(true)
    expect(FakeRecorder.ultima?.state).toBe('recording')

    captura.setMuted(true)

    expect(faixa.enabled).toBe(false)
    expect(FakeRecorder.ultima?.state).toBe('recording') // um blob só, linha do tempo intacta
    expect(faixa.stop).not.toHaveBeenCalled()

    await captura.stop()
  })

  it('desmutar reabilita a MESMA faixa, sem abrir outra captura', async () => {
    const { captura, faixa } = await capturaAberta()
    const pedidos = (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mock.calls.length

    captura.setMuted(true)
    captura.setMuted(false)

    expect(faixa.enabled).toBe(true)
    expect((navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mock.calls.length).toBe(pedidos)

    await captura.stop()
  })

  it('alternar para o mesmo estado não faz nada (clique repetido é inofensivo)', async () => {
    const { captura, faixa } = await capturaAberta()
    captura.setMuted(true)
    captura.setMuted(true)
    expect(faixa.enabled).toBe(false)
    captura.setMuted(false)
    captura.setMuted(false)
    expect(faixa.enabled).toBe(true)
    await captura.stop()
  })

  it('mutar no meio de uma frase descarta o enunciado em curso', async () => {
    /* Sem isto o parcial ficaria pendurado na tela para sempre: o VAD nunca fecharia um
       segmento que, a partir do mudo, só recebe silêncio. */
    const faixa = faixaFalsa()
    const stream = {
      getAudioTracks: () => [faixa],
      getTracks: () => [faixa],
    } as unknown as MediaStream
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn(async () => stream) },
    })
    const onMisfire = vi.fn()
    const captura = await startMicCapture(undefined, { onUtterance: vi.fn(), onMisfire } as never)

    captura.setMuted(true)
    expect(onMisfire).toHaveBeenCalledTimes(1)

    // Desmutar não descarta nada: não há enunciado em curso para jogar fora.
    captura.setMuted(false)
    expect(onMisfire).toHaveBeenCalledTimes(1)

    await captura.stop()
  })
})
