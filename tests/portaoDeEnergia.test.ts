import { describe, expect, it, vi } from 'vitest'

import { comPortaoDeEnergia } from '../src/gateway/capture/portaoDeEnergia'

const N = 1536
const zeros = () => new Float32Array(N)
const seno = (amp: number) => Float32Array.from({ length: N }, (_, i) => amp * Math.sin(i / 5))
/** Ruído constante com RMS exato (alterna +-rms). */
const ruido = (rms: number) => Float32Array.from({ length: N }, (_, i) => (i % 2 ? rms : -rms))

function modeloFalso() {
  const process = vi.fn(async () => ({ isSpeech: 0.5, notSpeech: 0.5 }))
  const reset = vi.fn()
  return { process, reset }
}

describe('comPortaoDeEnergia', () => {
  it('20 quadros de zeros: o modelo roda 8 vezes e 12 são pulados', async () => {
    const m = modeloFalso()
    const p = comPortaoDeEnergia(m)
    const saidas = []
    for (let i = 0; i < 20; i++) saidas.push(await p.process(zeros()))
    expect(m.process).toHaveBeenCalledTimes(8)
    expect(p.quadrosPulados()).toBe(12)
    expect(saidas[19]).toEqual({ isSpeech: 0, notSpeech: 1 })
  })

  it('quadro fraco acima do piso depois de silêncio longo é processado, com reset antes', async () => {
    const m = modeloFalso()
    const p = comPortaoDeEnergia(m)
    for (let i = 0; i < 20; i++) await p.process(zeros())
    m.process.mockClear()
    const fraco = seno(0.01) // RMS ~0,007, acima do piso
    await p.process(fraco)
    expect(m.reset).toHaveBeenCalledTimes(1)
    expect(m.process).toHaveBeenCalledTimes(1)
    expect(m.process).toHaveBeenCalledWith(fraco)
    expect(m.reset.mock.invocationCallOrder[0]).toBeLessThan(m.process.mock.invocationCallOrder[0]!)
  })

  it('ruído contínuo com RMS 0,002 nunca é pulado', async () => {
    const m = modeloFalso()
    const p = comPortaoDeEnergia(m)
    for (let i = 0; i < 30; i++) await p.process(ruido(0.002))
    expect(m.process).toHaveBeenCalledTimes(30)
    expect(p.quadrosPulados()).toBe(0)
    expect(m.reset).not.toHaveBeenCalled()
  })

  it('sem pulos antes, um quadro alto não dá reset', async () => {
    const m = modeloFalso()
    const p = comPortaoDeEnergia(m)
    await p.process(zeros())
    await p.process(seno(0.1))
    expect(m.reset).not.toHaveBeenCalled()
  })

  it('o reset externo é repassado ao modelo', () => {
    const m = modeloFalso()
    comPortaoDeEnergia(m).reset()
    expect(m.reset).toHaveBeenCalledTimes(1)
  })
})

/*
 * O PORTÃO COM O `FrameProcessor` DE VERDADE (`@ricky0123/vad-web`), com os parâmetros da captura
 * (`systemAudio.ts`: limiar 0,5, redenção 800 ms, pré-pad 300 ms, mínimo 400 ms, quadros de 96 ms) e um
 * Silero falso que responde pela energia do quadro. A pergunta: depois de um silêncio longo (quadros
 * PULADOS pelo portão), a fala BAIXA, acima do piso, ainda dispara o começo da fala e o áudio entregue
 * começa no quadro em que ela começou? Se não, a pessoa perde o começo da frase.
 */
describe('comPortaoDeEnergia + FrameProcessor real', () => {
  it('silêncio longo e depois fala baixa: SpeechStart dispara e o áudio inclui o quadro de início', async () => {
    const { FrameProcessor, Message } = await import('@ricky0123/vad-web')
    const silero = {
      // O Silero falso: "fala" quando o quadro tem energia de voz baixa ou mais (RMS >= 0,005).
      process: vi.fn(async (q: Float32Array) => {
        let s = 0
        for (const v of q) s += v * v
        const r = Math.sqrt(s / q.length)
        return r >= 0.005 ? { isSpeech: 0.9, notSpeech: 0.1 } : { isSpeech: 0.02, notSpeech: 0.98 }
      }),
      reset: vi.fn(),
    }
    const portao = comPortaoDeEnergia(silero)
    const fp = new FrameProcessor(
      (q) => portao.process(q),
      () => portao.reset(),
      {
        positiveSpeechThreshold: 0.5,
        negativeSpeechThreshold: 0.35,
        redemptionMs: 800,
        preSpeechPadMs: 300,
        minSpeechMs: 400,
        submitUserSpeechOnPause: false,
      },
      N / 16,
    )
    fp.resume()
    silero.reset.mockClear() // o construtor do FrameProcessor já chama o reset uma vez
    const eventos: Array<{ msg: string; audio?: Float32Array }> = []
    const aoEvento = (ev: { msg: string; audio?: Float32Array }) => {
      if (ev.msg !== Message.FrameProcessed) eventos.push(ev)
    }

    for (let i = 0; i < 60; i++) await fp.process(zeros(), aoEvento) // ~5,8 s de silêncio de sala
    expect(portao.quadrosPulados()).toBeGreaterThan(40)

    // Fala baixa (RMS ~0,007, acima do piso de 0,0015). O quadro de início tem amplitude própria para ser achado.
    const inicio = seno(0.0105)
    await fp.process(inicio, aoEvento)
    expect(eventos.map((e) => e.msg)).toContain(Message.SpeechStart)
    expect(silero.reset).toHaveBeenCalledTimes(1) // o estado velho do modelo foi reiniciado antes do quadro
    for (let i = 0; i < 9; i++) await fp.process(seno(0.01), aoEvento) // ~1 s de fala
    for (let i = 0; i < 12; i++) await fp.process(zeros(), aoEvento) // a redenção fecha a fala

    const fim = eventos.find((e) => e.msg === Message.SpeechEnd)
    expect(fim?.audio).toBeTruthy()
    const audio = fim!.audio!
    const quadros = audio.length / N
    const temOInicio = Array.from({ length: quadros }, (_, k) => audio.subarray(k * N, (k + 1) * N)).some(
      (q) => q[7] === inicio[7] && q[100] === inicio[100],
    )
    expect(temOInicio).toBe(true)
    expect(quadros).toBeGreaterThanOrEqual(10)
  })
})
