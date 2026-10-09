// @vitest-environment jsdom
/**
 * A ABA CONQUISTAS NA EDIÇÃO ESTÁTICA: as conquistas são creditadas pelo servidor em memória
 * (`data/efemero/rotas/economia.ts`), então a aba mostra o conteúdo — e não o cartão "Disponível na
 * versão completa". E a contagem da aba conta CONQUISTAS (feitas/total), não itens do catálogo.
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.hoisted(() => vi.stubEnv('VITE_EDICAO_ESTATICA', '1'))

import Loja from '../src/components/views/Loja'
import { CONQUISTAS } from '../src/core'
import { contarConquistas } from '../src/lib/conquistas'
import { EMPTY_PROGRESS } from '../src/lib/progress'

afterEach(cleanup)

const noop = () => {}

function renderizar() {
  return render(
    <Loja
      progress={{ ...EMPTY_PROGRESS, available: true }}
      theme={'claro' as never}
      setTheme={noop}
      fonte={'padrao' as never}
      setFonte={noop}
      menuPosition={'left' as never}
      setMenuPosition={noop}
      onOpenStudio={noop}
      ctxConquistas={null}
      ageProfile={'adult' as never}
      setAgeProfile={noop}
      abaInicial="conquistas"
    />,
  )
}

describe('Personalizar · aba Conquistas na edição estática', () => {
  beforeEach(() => localStorage.clear())

  it('mostra as conquistas, e não o cartão de "versão completa"', () => {
    renderizar()
    expect(screen.queryByTestId('cartao-de-convite')).toBeNull()
    expect(screen.getByTestId('conquistas-no-quest')).toBeTruthy()
    expect(document.querySelectorAll('.conq')).toHaveLength(CONQUISTAS.length)
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Partes dos desafios' })).getByRole('button', { name: /Como ganhar/ }),
    )
    expect(screen.getByText('Como ganhar Seeds e XP')).toBeTruthy()
  })

  it('a contagem da aba é de conquistas (feitas/total), não de itens do catálogo', () => {
    localStorage.setItem('babel.conquistas', JSON.stringify([CONQUISTAS[0].id, CONQUISTAS[1].id]))
    renderizar()
    const aba = screen.getByRole('tab', { name: /Conquistas/ })
    expect(within(aba).getByText(`2/${CONQUISTAS.length}`)).toBeTruthy()
  })
})

describe('contarConquistas', () => {
  beforeEach(() => localStorage.clear())

  it('soma a posse local ao progresso e nunca passa do total', () => {
    expect(contarConquistas(null)).toEqual({ feitas: 0, total: CONQUISTAS.length })
    localStorage.setItem('babel.conquistas', JSON.stringify([CONQUISTAS[0].id, 'id-que-nao-existe']))
    expect(contarConquistas(null)).toEqual({ feitas: 1, total: CONQUISTAS.length })
  })
})
