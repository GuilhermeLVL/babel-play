// @vitest-environment jsdom
/**
 * A NOVIDADE DISCRETA (22/10/2026): recompensa sem peça a equipar vira um cartão no canto, agrupado,
 * que some sozinho e manda "Ver" para a tela certa. O modal fica para o que tem peça.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import NovidadeDiscreta, {
  DURACAO_DA_NOVIDADE_MS,
  loteDiscreto,
  precisaDeModal,
} from '../src/components/NovidadeDiscreta'
import { type Recompensa, recompensasVistas } from '../src/lib/filaDeRecompensas'
import { CATALOGO_DA_LOJA } from '../src/lib/loja'

const item = CATALOGO_DA_LOJA.find((i) => i.precoSeeds !== undefined && !i.exclusivoDe)!
const conquista = (id: string, xp = 5): Recompensa => ({ tipo: 'conquista', id, nome: id, seeds: 10, xp })
const nivelSemItens: Recompensa = { tipo: 'nivel', nivel: 3, itens: [] }
const nivelComItens: Recompensa = { tipo: 'nivel', nivel: 2, itens: [item] }
const repetido: Recompensa = { tipo: 'drop', roundId: 'r1', seeds: 40, repetido: true }
const dropComItem: Recompensa = { tipo: 'drop', roundId: 'r2', seeds: 5, item }

beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('precisaDeModal / loteDiscreto', () => {
  it('modal só com peça a equipar', () => {
    expect(precisaDeModal(nivelComItens)).toBe(true)
    expect(precisaDeModal(dropComItem)).toBe(true)
    const conquistaComExclusivo: Recompensa = { tipo: 'conquista', id: 'x', nome: 'x', seeds: 1, xp: 1, item }
    expect(precisaDeModal(conquistaComExclusivo)).toBe(true)
    expect(precisaDeModal(nivelSemItens)).toBe(false)
    expect(precisaDeModal(conquista('x'))).toBe(false)
    expect(precisaDeModal(repetido)).toBe(false)
  })
  it('o lote discreto é o prefixo da fila até a primeira que pede modal', () => {
    expect(loteDiscreto([conquista('a'), repetido, nivelComItens, conquista('b')])).toEqual([conquista('a'), repetido])
    expect(loteDiscreto([nivelComItens, conquista('a')])).toEqual([])
  })
})

describe('NovidadeDiscreta', () => {
  it('agrupa o lote: título, conquistas, Seeds e XP somados; não é diálogo', () => {
    render(
      <NovidadeDiscreta
        novidades={[conquista('a', 5), conquista('b', 7), repetido]}
        onFechar={vi.fn()}
        onVer={vi.fn()}
      />,
    )
    expect(screen.queryByRole('dialog')).toBeNull()
    const cartao = screen.getByRole('status')
    expect(cartao.textContent).toContain('3 novidades')
    expect(cartao.textContent).toContain('2 conquistas')
    expect(cartao.textContent).toContain('+60 Seeds')
    expect(cartao.textContent).toContain('+12 XP')
  })

  it('uma só: o nome dela, sem "novidades"', () => {
    render(<NovidadeDiscreta novidades={[conquista('Constante')]} onFechar={vi.fn()} onVer={vi.fn()} />)
    expect(screen.getByRole('status').textContent).toContain('Constante')
    expect(screen.queryByText(/novidades/)).toBeNull()
  })

  it('some sozinho: marca todas como vistas e tira cada uma da fila, uma vez só', () => {
    vi.useFakeTimers()
    const onFechar = vi.fn()
    render(<NovidadeDiscreta novidades={[conquista('a'), repetido]} onFechar={onFechar} onVer={vi.fn()} />)
    act(() => {
      vi.advanceTimersByTime(DURACAO_DA_NOVIDADE_MS + 10)
    })
    expect(onFechar).toHaveBeenCalledTimes(2)
    expect(recompensasVistas().size).toBe(2)
    act(() => {
      vi.advanceTimersByTime(DURACAO_DA_NOVIDADE_MS)
    })
    expect(onFechar).toHaveBeenCalledTimes(2)
  })

  it('"Ver" vai às conquistas quando há conquista no lote, senão a Personalizar; e fecha', () => {
    const onVer = vi.fn()
    const onFechar = vi.fn()
    render(<NovidadeDiscreta novidades={[repetido, conquista('a')]} onFechar={onFechar} onVer={onVer} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ver' }))
    expect(onVer).toHaveBeenCalledWith('conquistas')
    expect(onFechar).toHaveBeenCalledTimes(2)
    cleanup()
    const onVer2 = vi.fn()
    render(<NovidadeDiscreta novidades={[nivelSemItens]} onFechar={vi.fn()} onVer={onVer2} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ver' }))
    expect(onVer2).toHaveBeenCalledWith('personalizar')
  })

  it('o X fecha na hora', () => {
    const onFechar = vi.fn()
    render(<NovidadeDiscreta novidades={[conquista('a')]} onFechar={onFechar} onVer={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(onFechar).toHaveBeenCalledTimes(1)
  })
})
