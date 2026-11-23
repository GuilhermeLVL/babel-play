// @vitest-environment jsdom
/** A cauda provisória do parcial (parciais vivos): estilo próprio e fora do que o leitor de tela anuncia. */
import { cleanup, render } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/data/api', () => ({
  fetchSettings: vi.fn(async () => null),
  patchUiSettings: vi.fn(async () => {}),
}))

import LegendasFlutuantes, { type LegendaAoVivo } from '../src/components/views/captura/LegendasFlutuantes'

beforeEach(() => localStorage.clear())
afterEach(cleanup)

const montar = (fala: LegendaAoVivo) => render(<LegendasFlutuantes falas={[fala]} aoFechar={vi.fn()} />)
const base = { id: '1', quem: 'Outros', traducao: '', lado: 'eles' as const }

describe('cauda provisória do parcial', () => {
  it('o confirmado fica fora da cauda; a cauda tem o estilo próprio e aria-live="off"', () => {
    const { container } = montar({ ...base, original: 'the cat sat on', parcial: true, confirmado: 'the cat' })
    const cauda = container.querySelector('.leg-provisoria')
    expect(cauda?.textContent?.trim()).toBe('sat on')
    expect(cauda?.getAttribute('aria-live')).toBe('off')
    expect(cauda?.hasAttribute('data-provisorio')).toBe(true)
    expect(container.querySelector('.leg-o')?.textContent).toBe('the cat sat on')
    expect(container.querySelector('.leg-o')?.firstElementChild?.textContent).not.toContain('sat')
  })

  it('o texto anunciado (região viva) nunca leva a cauda de um parcial', () => {
    const { container } = montar({ ...base, original: 'the cat sat on', parcial: true, confirmado: 'the cat' })
    expect(container.querySelector('.leg-anuncio')?.textContent).toBe('')
  })

  it('sem confirmado, ou já final, não há cauda (o de sempre)', () => {
    const a = montar({ ...base, original: 'the cat', parcial: true })
    expect(a.container.querySelector('.leg-provisoria')).toBeNull()
    cleanup()
    const b = montar({ ...base, original: 'the cat sat', parcial: false, confirmado: 'the cat' })
    expect(b.container.querySelector('.leg-provisoria')).toBeNull()
  })

  it('confirmado tudo: sem cauda', () => {
    const { container } = montar({ ...base, original: 'the cat', parcial: true, confirmado: 'the cat' })
    expect(container.querySelector('.leg-provisoria')).toBeNull()
  })
})
