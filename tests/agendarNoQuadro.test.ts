// @vitest-environment jsdom
/**
 * UM SETTER POR QUADRO ("Grátis sem travar", A1).
 *
 * O streaming do decode e o progresso dos modelos chegavam à tela da captura como dezenas de
 * `setState` por segundo. Aqui as ações de um mesmo quadro viram UMA chamada — com o MESMO resultado
 * de aplicá-las uma a uma —, e o que não pode esperar (o final) passa por `agora`, que aplica os
 * pendentes antes dele: um parcial velho nunca cai por cima de um final.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { setterNoQuadro } from '../src/lib/captura/agendarNoQuadro'

interface Fala {
  id: string
  texto: string
  isPartial: boolean
}

/** Um `setState` de verdade em miniatura: guarda o estado e conta as chamadas. */
function estadoFalso<T>(inicial: T) {
  let estado = inicial
  const set = vi.fn((a: T | ((p: T) => T)) => {
    estado = typeof a === 'function' ? (a as (p: T) => T)(estado) : a
  })
  return { set, ler: () => estado }
}

const parcial = (texto: string) => (prev: Fala[]) =>
  prev.map((f) => (f.id === 'a' && f.isPartial ? { ...f, texto } : f))
const final = (texto: string) => (prev: Fala[]) =>
  prev.map((f) => (f.id === 'a' ? { ...f, texto, isPartial: false } : f))

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('setterNoQuadro', () => {
  it('cinco atualizações no mesmo quadro → UMA chamada, com o resultado da sequência', () => {
    const { set, ler } = estadoFalso<Fala[]>([{ id: 'a', texto: '', isPartial: true }])
    const agendar = setterNoQuadro(set)
    for (const t of ['O', 'Olá', 'Olá, tu', 'Olá, tudo', 'Olá, tudo bem']) agendar(parcial(t))
    expect(set).not.toHaveBeenCalled()
    vi.advanceTimersToNextFrame()
    expect(set).toHaveBeenCalledTimes(1)
    expect(ler()[0].texto).toBe('Olá, tudo bem')
    vi.advanceTimersByTime(500)
    expect(set).toHaveBeenCalledTimes(1) // nada sobrou para depois
  })

  it('`agora` aplica os pendentes ANTES, na mesma chamada: o final não é sobrescrito por parcial velho', () => {
    const { set, ler } = estadoFalso<Fala[]>([{ id: 'a', texto: '', isPartial: true }])
    const agendar = setterNoQuadro(set)
    agendar(parcial('Olá, tu'))
    agendar.agora(final('Olá, tudo bem?'))
    expect(set).toHaveBeenCalledTimes(1)
    expect(ler()[0]).toEqual({ id: 'a', texto: 'Olá, tudo bem?', isPartial: false })
    agendar(parcial('Olá, tudo')) // parcial atrasado, depois do final
    vi.advanceTimersToNextFrame()
    expect(ler()[0].texto).toBe('Olá, tudo bem?')
  })

  it('`agora` sem nada pendente repassa a ação como veio (o setter recebe a mesma função)', () => {
    const { set } = estadoFalso<Fala[]>([])
    const acao = final('x')
    setterNoQuadro(set).agora(acao)
    expect(set).toHaveBeenCalledWith(acao)
  })

  it('valor direto no meio da fila: vale o último, e o que vem depois se aplica sobre ele', () => {
    const { set, ler } = estadoFalso<number | null>(0)
    const agendar = setterNoQuadro(set)
    agendar((n) => (n ?? 0) + 1)
    agendar(null)
    agendar((n) => (n ?? 10) + 5)
    vi.advanceTimersToNextFrame()
    expect(set).toHaveBeenCalledTimes(1)
    expect(ler()).toBe(15)
  })

  it('o MESMO setter dá o mesmo agendador — a fábrica do pipeline roda a cada render', () => {
    const { set, ler } = estadoFalso<Fala[]>([{ id: 'a', texto: '', isPartial: true }])
    // Render N agenda um parcial; o final chega pela fábrica do render N+1.
    setterNoQuadro(set)(parcial('Olá'))
    setterNoQuadro(set).agora(final('Olá, tudo bem?'))
    expect(set).toHaveBeenCalledTimes(1)
    vi.advanceTimersToNextFrame()
    expect(set).toHaveBeenCalledTimes(1)
    expect(ler()[0].texto).toBe('Olá, tudo bem?')
  })

  it('aba escondida (o quadro não vem): a rede de segurança aplica assim mesmo', () => {
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
    const { set, ler } = estadoFalso<Fala[]>([{ id: 'a', texto: '', isPartial: true }])
    setterNoQuadro(set)(parcial('Olá'))
    vi.advanceTimersByTime(50)
    expect(set).not.toHaveBeenCalled()
    vi.advanceTimersByTime(60)
    expect(set).toHaveBeenCalledTimes(1)
    expect(ler()[0].texto).toBe('Olá')
  })

  it('sem requestAnimationFrame: um quadro de ~16 ms pelo setTimeout', () => {
    vi.stubGlobal('requestAnimationFrame', undefined)
    const { set } = estadoFalso<Fala[]>([])
    setterNoQuadro(set)((p) => p)
    vi.advanceTimersByTime(15)
    expect(set).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(set).toHaveBeenCalledTimes(1)
  })
})
