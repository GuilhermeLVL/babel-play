// @vitest-environment jsdom
/**
 * O CABEÇALHO DA ABA TEMPORADA mostra o nível DA TEMPORADA (o XP ganho dentro da janela, somado
 * no servidor — `GET /api/metrics/temporada`), nunca o nível da conta.
 *
 * O defeito: antes da temporada começar a aba dizia "Nível 1 · 0/100 XP · a seguir: Linear Indigo",
 * o progresso da CONTA vestido de temporada. Fora das datas o cabeçalho não mostra progresso
 * nenhum: quem fala é a faixa "Próxima temporada em N dias" (sem contagem para o perfil protegido,
 * coberto em `temporada-tela.test.tsx`).
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import CabecalhoDeTemporada from '../src/components/views/loja/CabecalhoDeTemporada'
import { TEMPORADAS } from '../src/core/temporada'
import type { TemporadaNoServidor } from '../src/data/api'
import type { Carteira } from '../src/lib/carteira'

afterEach(cleanup)

const T1 = TEMPORADAS[0]
const carteira = { disponivel: false, creditos: null } as unknown as Carteira

function montar(estado: TemporadaNoServidor | null | undefined) {
  return render(<CabecalhoDeTemporada estado={estado} saldo={42} carteira={carteira} />)
}

describe('cabeçalho de temporada', () => {
  it('durante a temporada: o nível e o XP DA TEMPORADA, com a próxima casa da trilha', () => {
    montar({ temporada: T1, proxima: null, xp: 320, nivel: 2, assinante: false, creditados: [] })
    const barra = screen.getByRole('progressbar')
    expect(barra.getAttribute('aria-valuenow')).toBe(String(Math.round((20 / 150) * 100)))
    expect(screen.getByText(/20 \/ 150 XP · faltam 130 XP/)).toBeTruthy()
    expect(screen.getByTestId('nivel-da-temporada').textContent).toContain('2')
    // A próxima casa com recompensa na trilha grátis (as pares): o nível 4.
    expect(screen.getByTestId('proxima-da-temporada').textContent).toMatch(/nível 4 da temporada/)
  })

  it('antes da temporada: nenhum progresso (nem da conta), só o nome e a carteira', () => {
    montar({ temporada: null, proxima: T1, xp: 0, nivel: 0, assinante: false, creditados: [] })
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(screen.queryByText(/XP/)).toBeNull()
    expect(screen.queryByText(/a seguir/)).toBeNull()
    expect(screen.getByText(new RegExp(T1.nome))).toBeTruthy()
    expect(screen.getByText('42')).toBeTruthy()
  })

  it('carregando ou sem resposta: nada de nível inventado', () => {
    montar(undefined)
    expect(screen.queryByRole('progressbar')).toBeNull()
    cleanup()
    montar(null)
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(screen.queryByText(/XP/)).toBeNull()
  })
})
