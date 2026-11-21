import { expect, test } from '@playwright/test'

import { abrirMais, abrirTela, clicarRobusto, naBarraDeCinco, trilho } from './_helpers'

/**
 * `/creditos` E `/planos` NO NAVEGADOR (mudança `vender-onde-se-ve`, tarefa 6.2).
 *
 * A spec pede: cada tela de compra tem URL própria; `/planos` (plural) abre a tela de planos e não o Hub;
 * Planos é alcançável pela navegação principal. E o ANUAL está fechado (`src/core/planos.ts`): não pode
 * aparecer em Planos, nem como seletor nem como texto de preço.
 *
 * A suíte roda no self-host sem cobrança, então o que se confere é o que existe aí.
 */

test('/planos (plural) abre a tela de planos, e não o Hub, sem oferecer o anual', async ({ page }) => {
  await abrirTela(page, '/planos')
  // O endereço publicado é o canônico: uma tela, um endereço na barra.
  await expect(page).toHaveURL(/\/plano$/)
  const tela = page.getByTestId('planos-do-quest')
  await expect(tela).toBeVisible()
  await expect(tela.getByRole('heading', { level: 1 })).toHaveCount(1)
  await expect(tela.getByText('Seu plano: Self-host')).toBeVisible()
  await expect(tela.getByRole('button', { name: 'Assinar Premium' })).toBeVisible()
  // O anual está fechado: nem seletor, nem a palavra na tela.
  await expect(page.getByRole('radio', { name: /Anual/ })).toHaveCount(0)
  await expect(page.getByText(/anual|\/ano|por ano/i)).toHaveCount(0)
})

test('Planos está na navegação principal e leva à tela de planos', async ({ page }) => {
  await abrirTela(page, '/')
  // No computador e no tablet é um item do trilho; no celular, a entrada "Planos e Premium" do painel "Mais destinos".
  const entrada = naBarraDeCinco(page)
    ? (await abrirMais(page)).getByTestId('planos-no-mais')
    : trilho(page).locator('[data-px-rota="planos"]')
  await expect(entrada).toBeVisible()
  await clicarRobusto(page, entrada)
  await expect(page).toHaveURL(/\/plano$/)
  await expect(page.getByTestId('planos-do-quest')).toBeVisible()
})

test('/creditos abre a compra de Créditos na aba Loja; sem cobrança (self-host), a tela diz que não há o que vender', async ({
  page,
}) => {
  await abrirTela(page, '/creditos')
  await expect(page).toHaveURL(/\/loja\/loja$/)
  const nota = page.getByTestId('comprar-creditos')
  await expect(nota).toBeVisible()
  await expect(nota).toContainText('não há compra com dinheiro')
})
