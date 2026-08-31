// @vitest-environment jsdom
/**
 * CARD DE PLANOS (spec planos-visiveis) — os contratos presos:
 * 1. Aparece para free/anonimo; NUNCA para assinante ou self-host.
 * 2. Dispensar grava e o card não volta em render seguinte.
 * 3. O preço vem da PLAN_MATRIX, não de string escrita à mão.
 */
import { it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

afterEach(() => { cleanup(); vi.resetModules(); localStorage.clear() })

async function montar(plan: string) {
  vi.doMock('../src/lib/entitlements', () => ({ getEntitlements: () => ({ plan }) }))
  vi.doMock('../src/lib/edicao', () => ({ EDICAO_LEVE: false }))
  const { default: CardDePlanos } = await import('../src/components/CardDePlanos')
  return render(<CardDePlanos onVerPlanos={vi.fn()} />)
}

it('plano free vê o card, com o preço da matriz (R$ 9,90)', async () => {
  await montar('free')
  const card = screen.getByTestId('card-de-planos')
  expect(card.textContent).toContain('R$ 9,90')
})

it('anônimo também vê', async () => {
  await montar('anonimo')
  expect(screen.getByTestId('card-de-planos')).toBeTruthy()
})

for (const plan of ['essencial', 'pro', 'selfhost']) {
  it(`${plan} NUNCA vê anúncio`, async () => {
    const { container } = await montar(plan)
    expect(container.querySelector('[data-testid="card-de-planos"]')).toBeNull()
  })
}

it('dispensar grava e o card não volta', async () => {
  await montar('free')
  fireEvent.click(screen.getByRole('button', { name: 'Dispensar este aviso de planos' }))
  expect(screen.queryByTestId('card-de-planos')).toBeNull()
  cleanup(); vi.resetModules()
  await montar('free')
  expect(screen.queryByTestId('card-de-planos')).toBeNull()
})

it('na edição leve não há o que vender', async () => {
  vi.doMock('../src/lib/entitlements', () => ({ getEntitlements: () => ({ plan: 'free' }) }))
  vi.doMock('../src/lib/edicao', () => ({ EDICAO_LEVE: true }))
  const { default: CardDePlanos } = await import('../src/components/CardDePlanos')
  const { container } = render(<CardDePlanos onVerPlanos={vi.fn()} />)
  expect(container.querySelector('[data-testid="card-de-planos"]')).toBeNull()
})
