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
