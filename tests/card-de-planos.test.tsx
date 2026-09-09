// @vitest-environment jsdom
/**
 * CARD DE PLANOS (spec planos-visiveis) — os contratos presos:
 * 1. Aparece para free/anonimo; NUNCA para assinante ou self-host.
 * 2. Dispensar grava e o card não volta em render seguinte.
 * 3. O preço vem da PLAN_MATRIX, não de string escrita à mão.
 */
import { cleanup, fireEvent,render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => { cleanup(); vi.resetModules(); localStorage.clear() })

async function montar(plan: string) {
  vi.doMock('../src/lib/entitlements', () => ({ getEntitlements: () => ({ plan }) }))
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

/* O caso "na edição leve não há o que vender" SAIU em 07/09 com a própria edição leve. Ele
   provava que `planoAnunciavel()` devolvia `false` quando o build era o hospedado sem conta —
   uma condição que não existe mais. O que decide hoje é só o plano, e os casos acima já cobrem
   as quatro respostas dele. */
