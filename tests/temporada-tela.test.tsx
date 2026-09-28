// @vitest-environment jsdom
/**
 * A TELA DA TEMPORADA (recompensas v2, onda 5; spec 8.3):
 * 1. Fora das datas, diz quando vem a próxima — com a contagem de dias para adulto e SEM contagem
 *    para o perfil protegido (a data, e nada correndo).
 * 2. As duas trilhas aparecem; a de assinante não oferece compra nem de nível nem de Créditos.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import PasseDeTemporada from '../src/components/views/passe/PasseDeTemporada'
import { TEMPORADAS } from '../src/core/temporada'
import type { TemporadaNoServidor } from '../src/data/api'
import type { ContextoDeEquipar } from '../src/lib/galeria/equipar'

const T1 = TEMPORADAS[0]
const ctx = { nivel: 1, saldo: 0 } as unknown as ContextoDeEquipar

function montar(estado: TemporadaNoServidor | null, protegido: boolean) {
  return render(<PasseDeTemporada temporada={estado} ctxEquipar={ctx} equipadoAtual={() => false} protegido={protegido} />)
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-27T12:00:00-03:00'))
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const antes: TemporadaNoServidor = { temporada: null, proxima: T1, xp: 0, nivel: 0, assinante: false, creditados: [] }

describe('fora das datas', () => {
  it('adulto: "próxima temporada em N dias", com a data', () => {
    montar(antes, false)
    const faixa = screen.getByTestId('faixa-da-temporada').textContent ?? ''
    expect(faixa).toMatch(/Próxima temporada em 4 dias/)
    expect(faixa).toMatch(/outubro/)
  })

  it('perfil protegido: a data, sem contagem de dias', () => {
    montar(antes, true)
    const faixa = screen.getByTestId('faixa-da-temporada').textContent ?? ''
    expect(faixa).toMatch(/Próxima temporada em/)
    expect(faixa).toMatch(/outubro/)
    expect(faixa).not.toMatch(/\bdias?\b/)
  })

  it('sem temporada anunciada, diz que ainda não tem data — e não desenha trilha', () => {
    montar({ ...antes, proxima: null }, false)
    expect(screen.getByTestId('faixa-da-temporada').textContent).toMatch(/ainda não tem data/)
    expect(screen.queryByText('Assinante')).toBeNull()
  })
})

describe('durante a temporada', () => {
  const durante: TemporadaNoServidor = { temporada: T1, proxima: null, xp: 320, nivel: 2, assinante: false, creditados: [] }

  it('as duas trilhas aparecem, com o nível da temporada e o XP que falta', () => {
    vi.setSystemTime(new Date('2026-10-15T12:00:00-03:00'))
    montar(durante, false)
    expect(screen.getByText('Grátis')).toBeTruthy()
    expect(screen.getByText('Assinante')).toBeTruthy()
    expect(screen.getByText(/Nível 2 de 30 · faltam 130 XP/)).toBeTruthy()
  })

  it('perfil protegido vê o período, sem "termina em N dias"', () => {
    vi.setSystemTime(new Date('2026-10-15T12:00:00-03:00'))
    montar(durante, true)
    expect(screen.getByTestId('faixa-da-temporada').textContent).not.toMatch(/termina em/)
  })

  it('nada na tela vende nível nem Créditos', () => {
    vi.setSystemTime(new Date('2026-10-15T12:00:00-03:00'))
    montar(durante, false)
    const texto = screen.getByTestId('temporada').textContent ?? ''
    expect(texto).not.toMatch(/Créditos|comprar n[ií]vel|Passe Premium/i)
  })
})
