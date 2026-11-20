/**
 * O CONVITE LEVA À PORTA E A PORTA DEVOLVE AO DESTINO (change `convites-sem-conta`).
 *
 * Sem conta, /perfil mostra o convite. "Criar conta" abre a porta já no cadastro; quem tem conta troca
 * para "Entrar" ali mesmo, entra, e volta para /perfil (a intenção guardada pelo pedido de login), não
 * para o Início. Roda com `playwright.publico.config.ts` (Supabase Auth falso, `_supabase-falso.mjs`).
 */
import { expect, test } from '@playwright/test'

test('visitante em /perfil: Criar conta abre o cadastro; entra e volta a /perfil', async ({ page }) => {
  await page.goto('/perfil')
  const cartao = page.getByTestId('cartao-de-convite')
  await expect(cartao).toContainText('O perfil é da conta', { timeout: 60_000 })

  await cartao.getByRole('button', { name: 'Criar conta', exact: true }).click()
  await expect(page.getByTestId('login-do-quest')).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: 'Criar conta' })).toBeVisible()

  /* A conta do Supabase falso já existe: troca para "Entrar" na própria porta. */
  await page.locator('.qen-rodape').getByRole('button', { name: 'Entrar', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Entrar' })).toBeVisible()
  await page.locator('#auth-email').fill('e2e@babel.test')
  await page.getByLabel('Senha', { exact: true }).fill('senha-e2e-123')
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()

  await expect(page.getByTestId('login-do-quest')).toBeHidden({ timeout: 30_000 })
  await expect(page).toHaveURL(/\/perfil$/)
  await expect(page.getByTestId('cartao-de-convite')).toHaveCount(0)
})
