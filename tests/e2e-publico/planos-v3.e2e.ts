/**
 * PLANOS v3 NO LANÇAMENTO — Grátis, Essencial e Premium, ponta a ponta no modo público.
 *
 * A venda dos planos novos é fechada de fábrica (`venda_planos_v3` nasce desligada). Aqui a flag é LIGADA
 * NA PÁGINA, como os outros e2e fazem (`modo-interprete.e2e.ts`): `/api/flags` e o `planosAVenda` do
 * `/api/billing/status` são simulados, porque o banco PGlite do e2e pertence ao processo do servidor e
 * não há conta admin semeada para o `PUT /api/admin/flags`. O login, a sessão e o resto são de verdade.
 *
 * O que se prova: a tela mostra 3 cartões (sem o Ao Vivo e sem voz neural, cujas flags seguem desligadas)
 * e o Essencial leva do cartão ao passo do pagamento do checkout. Nenhuma cobrança sai: `/api/billing/assinar`
 * nem chega a ser chamado.
 *
 *   npx playwright test -c playwright.publico.config.ts planos-v3
 */
import { expect, test } from '@playwright/test'

import { chegarEm, clicar, entrar } from './_nuance'

test('com a venda v3 aberta, a tela de Planos tem três cartões e o Essencial chega ao pagamento', async ({ page }) => {
  await page.route('**/api/flags', (r) => r.fulfill({ json: { flags: { venda_planos_v3: { ligada: true } } } }))
  await page.route('**/api/billing/status', (r) =>
    r.fulfill({ json: { configurado: true, assinatura: null, planosAVenda: ['essencial', 'premium'] } }),
  )
  const cobrancas: string[] = []
  await page.route('**/api/billing/assinar', (r) => {
    cobrancas.push(r.request().url())
    return r.abort()
  })

  await entrar(page, { premium: false })
  await page.goto('/plano')
  const cartoes = page.locator('.pl-planos-grade > .pl-plano')
  await chegarEm(page, cartoes.first())
  await expect(cartoes).toHaveCount(3)
  await expect(cartoes.evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.plPlano))).resolves.toEqual([
    'gratis',
    'essencial',
    'premium',
  ])

  const tela = page.locator('body')
  await expect(tela).toContainText('5 h de nuvem por mês')
  await expect(tela).toContainText('20 h de nuvem por mês')
  await expect(tela).not.toContainText(/Ao [Vv]ivo/)
  await expect(tela).not.toContainText(/neural/i)

  await clicar(page, page.getByRole('button', { name: 'Assinar Essencial' }).first())
  await clicar(page, page.getByRole('button', { name: /Ir para o pagamento/ }))
  await expect(page.getByRole('region', { name: 'Pagamento' })).toBeVisible()
  expect(cobrancas).toEqual([])
})
