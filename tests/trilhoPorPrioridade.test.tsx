// @vitest-environment jsdom
/**
 * O TRILHO POR PRIORIDADE (R40, 22/10/2026): no computador oito destinos (com Progresso e Planos), no
 * celular cinco botões; o item "Planos" diz o estado do plano em texto pequeno.
 */
import { cleanup, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const plano = vi.hoisted(() => ({ atual: 'free' as string }))
vi.mock('../src/lib/entitlements', async (original) => {
  const real = await original<typeof import('../src/lib/entitlements')>()
  return { ...real, getEntitlements: () => ({ ...real.getEntitlements(), plan: plano.atual }) as never }
})

import { NAV_ITEMS, navLabel } from '../src/components/shell/navItems'
import TrilhoDoQuest from '../src/components/shell/TrilhoDoQuest'

afterEach(cleanup)

const montar = () =>
  render(
    <TrilhoDoQuest
      activeView="hub"
      onChangeView={() => {}}
      ageProfile="pro"
      darkMode={false}
      toggleDarkMode={() => {}}
      soundEnabled
      toggleSound={() => {}}
    />,
  )

describe('o rótulo de Progresso', () => {
  const item = NAV_ITEMS.find((i) => i.id === 'estatisticas')!
  it('curto e por perfil', () => {
    expect(navLabel(item, 'pro', true)).toBe('Progresso')
    expect(navLabel(item, 'pro')).toBe('Progresso')
    expect(navLabel(item, 'kids')).toBe('Meu progresso')
    expect(navLabel(item, 'senior')).toBe('Meu progresso')
  })
})

describe('o estado do item Planos', () => {
  it('no Grátis diz o teste de 14 dias', () => {
    plano.atual = 'free'
    montar()
    const planos = screen.getByRole('button', { name: 'Planos' })
    expect(planos.textContent).toBe('PlanosGrátis · teste 14 dias')
    expect(planos.getAttribute('aria-describedby')).toBe('q-estado-do-plano')
  })
  it('sem conta (anônimo) também', () => {
    plano.atual = 'anonimo'
    montar()
    expect(screen.getByRole('button', { name: 'Planos' }).textContent).toContain('teste 14 dias')
  })
  it.each([
    ['essencial', 'Essencial'],
    ['premium', 'Premium'],
  ])('pagando (%s) diz o nome do plano', (p, rotulo) => {
    plano.atual = p
    montar()
    const planos = screen.getByRole('button', { name: 'Planos' })
    expect(planos.textContent).toBe(`Planos${rotulo}`)
    expect(planos.textContent).not.toContain('teste')
  })
})
