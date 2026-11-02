/** O motor global da fala: a Supertonic lê onde serve; fora disso, e na falha, o motor de antes. */
import { describe, expect, it, vi } from 'vitest'

import type { TtsEngine } from '../src/lib/tts'
import { criarMotorGlobal } from '../src/lib/voz/motorGlobal'

const motor = (): TtsEngine & { falas: string[] } => {
  const falas: string[] = []
  return { falas, speak: (t) => void falas.push(t), cancel: vi.fn() }
}
const solta = () => new Promise((r) => setTimeout(r, 0))

describe('criarMotorGlobal', () => {
  it('idioma que o motor neural lê vai para ele; o resto, para a reserva', async () => {
    const neural = motor()
    const reserva = motor()
    const m = criarMotorGlobal({ le: (i) => i.startsWith('pt'), neural: async () => neural, reserva })
    m.speak('olá', { lang: 'pt-BR' })
    await solta()
    m.speak('hello', { lang: 'fr-FR' })
    await solta()
    expect(neural.falas).toEqual(['olá'])
    expect(reserva.falas).toEqual(['hello'])
  })

  it('motor que não carrega: a mesma frase sai pela reserva', async () => {
    const reserva = motor()
    const m = criarMotorGlobal({ le: () => true, neural: async () => null, reserva })
    m.speak('olá', { lang: 'pt' })
    await solta()
    expect(reserva.falas).toEqual(['olá'])
  })

  it('cancelar antes de o motor carregar descarta a fala', async () => {
    const neural = motor()
    const reserva = motor()
    const m = criarMotorGlobal({ le: () => true, neural: async () => neural, reserva })
    m.speak('olá', { lang: 'pt' })
    m.cancel()
    await solta()
    expect(neural.falas).toEqual([])
    expect(reserva.falas).toEqual([])
  })
})
