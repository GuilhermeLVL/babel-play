/**
 * PLANOS v4 — Grátis, Plus e Pro ("em breve"), com a Família numa linha, ponta a ponta no modo público.
 *
 * Como no `planos-v3.e2e.ts`, a chave `venda_planos_v4` é LIGADA NA PÁGINA: `/api/flags` e o `planosAVenda`
 * do `/api/billing/status` são simulados (o banco PGlite do e2e pertence ao servidor e não há conta admin
 * semeada). O login, a sessão e o resto são de verdade. Nenhuma cobrança sai: `/api/billing/assinar` nem
 * chega a ser chamado.
 *
 * O que se prova, em 375 e em 1280: três cartões (Grátis, Plus, Pro), a linha da Família com preço e "em
 * breve" e sem botão, o Pro sem preço e sem botão, o Plus com 14,90 e 149,00 (anual à venda), o Plus
 * levando do cartão ao passo do pagamento — e nenhuma violação grave de acessibilidade (axe, WCAG 2.2 AA).
 * Com `CAPTURAS_PLANOS_V4=<pasta>` grava um PNG da tela de cada tamanho.
 *
 *   npx playwright test -c playwright.publico.config.ts planos-v4
 */
import { expect, test } from '@playwright/test'

import { violacoesGraves } from '../e2e/_acessibilidade'
import { chegarEm, clicar, entrar } from './_nuance'

const TAMANHOS = [
  { nome: '1280', largura: 1280, altura: 800 },
  { nome: '375', largura: 375, altura: 812 },
] as const

for (const { nome, largura, altura } of TAMANHOS) {
  test(`com a venda v4 aberta, a tela de Planos tem Grátis, Plus e Pro, e a Família numa linha (${nome})`, async ({
    page,
  }) => {
    await page.route('**/api/flags', (r) => r.fulfill({ json: { flags: { venda_planos_v4: { ligada: true } } } }))
    await page.route('**/api/billing/status', (r) =>
      r.fulfill({
        json: {
          configurado: true,
          assinatura: null,
          planosAVenda: ['plus'],
          teste: { estado: 'disponivel', dias: 14, plano: 'plus' },
        },
      }),
    )
    const cobrancas: string[] = []
    await page.route('**/api/billing/assinar', (r) => {
      cobrancas.push(r.request().url())
      return r.abort()
    })

    await page.setViewportSize({ width: largura, height: altura })
    await entrar(page, { premium: false })
    await page.goto('/plano')
    const cartoes = page.locator('.pl-planos-grade > .pl-plano')
    await chegarEm(page, cartoes.first())
    await expect(cartoes).toHaveCount(3)
    await expect(cartoes.evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.plPlano))).resolves.toEqual([
      'gratis',
      'plus',
      'pro4',
    ])

    const plus = page.locator('[data-pl-plano="plus"]')
    const pro = page.locator('[data-pl-plano="pro4"]')
    const familia = page.locator('[data-pl-familia]')
    await expect(plus).toContainText('R$ 14,90')
    await expect(plus).toContainText('8 h de nuvem por mês')
    await expect(plus.locator('.pl-em-breve-tag')).toHaveCount(2)
    await expect(pro).toContainText('Em breve')
    await expect(pro).not.toContainText('R$')
    await expect(pro.getByRole('button')).toHaveCount(0)
    await expect(familia).toContainText('para até 4 pessoas · R$ 24,90/mês · em breve')
    await expect(familia.getByRole('button')).toHaveCount(0)
    await expect(page.locator('body')).not.toContainText(/Essencial|Premium|Ao [Vv]ivo/)

    // O anual do Plus (149,00), se o servidor o vende: o seletor só existe com `ANUAL_ENABLED`.
    const anual = page.getByRole('radio', { name: /Anual/ })
    if (await anual.count()) {
      await clicar(page, anual)
      await expect(plus).toContainText('R$ 149,00')
      await expect(plus).toContainText('2 meses grátis')
      await clicar(page, page.getByRole('radio', { name: /Mensal/ }))
    }

    const pasta = process.env.CAPTURAS_PLANOS_V4
    if (pasta) {
      /* A rolagem é do miolo do app, não da página: a captura inteira pede uma janela alta. */
      await page.setViewportSize({ width: largura, height: nome === '375' ? 4200 : 2300 })
      await page.screenshot({ path: `${pasta}/planos-v4-${nome}.png` })
      await page.setViewportSize({ width: largura, height: altura })
    }

    expect(await violacoesGraves(page)).toEqual([])

    await clicar(page, plus.getByRole('button', { name: /Assinar Plus|Testar 14 dias grátis/ }).last())
    expect(cobrancas).toEqual([])
  })
}

test('o Plus leva do cartão ao passo do pagamento do checkout', async ({ page }) => {
  await page.route('**/api/flags', (r) => r.fulfill({ json: { flags: { venda_planos_v4: { ligada: true } } } }))
  await page.route('**/api/billing/status', (r) =>
    r.fulfill({ json: { configurado: true, assinatura: null, planosAVenda: ['plus'] } }),
  )
  const cobrancas: string[] = []
  await page.route('**/api/billing/assinar', (r) => {
    cobrancas.push(r.request().url())
    return r.abort()
  })

  await entrar(page, { premium: false })
  await page.goto('/plano')
  await chegarEm(page, page.locator('.pl-planos-grade > .pl-plano').first())
  await clicar(page, page.getByRole('button', { name: 'Assinar Plus' }).first())
  await expect(page.getByRole('region', { name: 'Plano e período' })).toContainText('Plus')
  await clicar(page, page.getByRole('button', { name: /Ir para o pagamento/ }))
  await expect(page.getByRole('region', { name: 'Pagamento' })).toBeVisible()
  expect(cobrancas).toEqual([])
})
