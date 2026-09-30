// @vitest-environment jsdom
/**
 * CARD DE PLANOS (spec planos-visiveis) — os contratos presos:
 * 1. Aparece para free/anonimo; NUNCA para assinante ou self-host.
 * 2. Dispensar grava e o card não volta em render seguinte.
 * 3. O preço vem da PLAN_MATRIX, não de string escrita à mão.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => {
  cleanup()
  vi.resetModules()
  localStorage.clear()
})

async function montar(plan: string, armazenamento: { usados: number; teto: number | null } | null = null) {
  vi.doMock('../src/lib/entitlements', () => ({ getEntitlements: () => ({ plan, armazenamento }) }))
  const { default: CardDePlanos } = await import('../src/components/CardDePlanos')
  return render(<CardDePlanos onVerPlanos={vi.fn()} />)
}

it('plano free vê o card, com o menor preço da matriz', async () => {
  await montar('free')
  const card = screen.getByTestId('card-de-planos')
  const { menorPrecoDeAssinatura } = await import('../src/core/planos')
  expect(card.textContent).toContain(`R$ ${menorPrecoDeAssinatura()}`)
})

it('anônimo também vê', async () => {
  await montar('anonimo')
  expect(screen.getByTestId('card-de-planos')).toBeTruthy()
})

for (const plan of ['premium', 'selfhost']) {
  it(`${plan} NUNCA vê anúncio`, async () => {
    const { container } = await montar(plan)
    expect(container.querySelector('[data-testid="card-de-planos"]')).toBeNull()
  })
}

it('dispensar grava e o card não volta', async () => {
  await montar('free')
  fireEvent.click(screen.getByRole('button', { name: 'Dispensar este aviso de planos' }))
  expect(screen.queryByTestId('card-de-planos')).toBeNull()
  cleanup()
  vi.resetModules()
  await montar('free')
  expect(screen.queryByTestId('card-de-planos')).toBeNull()
})

/* O caso "na edição leve não há o que vender" SAIU em 07/09 com a própria edição leve. Ele
   provava que `planoAnunciavel()` devolvia `false` quando o build era o hospedado sem conta —
   uma condição que não existe mais. O que decide hoje é só o plano, e os casos acima já cobrem
   as quatro respostas dele. */

/* FASE 8 — o aviso de armazenamento (>90%) IGNORAVA a dispensa e voltava a cada abertura do Hub.
   Agora ele respeita: dispensado, volta no máximo uma vez a cada 7 dias; "Não mostrar novamente"
   é para sempre. */
const CHEIO = { usados: 95, teto: 100 }

it('armazenamento >90% aparece mesmo com o anúncio comum dispensado há muito tempo', async () => {
  localStorage.setItem('babel.card_planos_dispensado', '1')
  await montar('free', CHEIO)
  expect(screen.getByTestId('card-de-planos').textContent).toContain('90%')
})

it('armazenamento >90%: dispensar RESPEITA a dispensa (não volta no próximo render)', async () => {
  await montar('free', CHEIO)
  fireEvent.click(screen.getByRole('button', { name: 'Dispensar este aviso de planos' }))
  expect(screen.queryByTestId('card-de-planos')).toBeNull()
  cleanup()
  vi.resetModules()
  await montar('free', CHEIO)
  expect(screen.queryByTestId('card-de-planos')).toBeNull()
})

it('armazenamento >90%: volta depois de 7 dias (teto de frequência), não antes', async () => {
  const { INTERVALO_DO_AVISO_DE_COTA_MS } = await import('../src/components/CardDePlanos')
  localStorage.setItem('babel.card_planos_dispensado_em', String(Date.now() - INTERVALO_DO_AVISO_DE_COTA_MS + 60_000))
  await montar('free', CHEIO)
  expect(screen.queryByTestId('card-de-planos')).toBeNull()
  cleanup()
  vi.resetModules()
  localStorage.setItem('babel.card_planos_dispensado_em', String(Date.now() - INTERVALO_DO_AVISO_DE_COTA_MS - 60_000))
  await montar('free', CHEIO)
  expect(screen.getByTestId('card-de-planos')).toBeTruthy()
})

it('dispensar o anúncio comum também conta para o teto do aviso de armazenamento', async () => {
  await montar('free')
  fireEvent.click(screen.getByRole('button', { name: 'Dispensar este aviso de planos' }))
  cleanup()
  vi.resetModules()
  await montar('free', CHEIO)
  expect(screen.queryByTestId('card-de-planos')).toBeNull()
})

it('armazenamento >90%: "Não mostrar novamente" é para sempre', async () => {
  await montar('free', CHEIO)
  fireEvent.click(screen.getByRole('button', { name: 'Não mostrar novamente' }))
  expect(screen.queryByTestId('card-de-planos')).toBeNull()
  cleanup()
  vi.resetModules()
  localStorage.setItem('babel.card_planos_dispensado_em', '1')
  await montar('free', CHEIO)
  expect(screen.queryByTestId('card-de-planos')).toBeNull()
})
