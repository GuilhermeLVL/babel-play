import { expect, type Page, test } from '@playwright/test'

import { clicarRobusto, fecharSobreposicoes } from './_helpers'

/**
 * AS TELAS DE PAGAMENTO DE PLANOS (protótipo aprovado: `T.planos`, `T.checkout`, `T.assinado`).
 *
 * A suíte roda no modo local (self-host, sem cobrança), e é exatamente aí que as travas de
 * dinheiro precisam segurar:
 * - o checkout existe e leva ao passo de pagamento, mas NÃO oferece pagar (nada a cobrar);
 * - a confirmação `/plano/assinado` não acredita na URL: aberta direto, sem pagamento confirmado
 *   pelo servidor, ela não comemora — e o endereço sobrevive ao recarregamento.
 */

async function abrir(page: Page, caminho: string) {
  await page.goto(caminho)
  await expect(page.getByRole('main')).toBeVisible()
  await fecharSobreposicoes(page)
}

test('Planos no self-host: sem aba de assinatura, sem seletor anual, sem cobrança', async ({ page }) => {
  await abrir(page, '/plano')
  await expect(page.getByRole('heading', { level: 1, name: 'Planos' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Seu plano agora' })).toContainText('Self-host')
  await expect(page.getByRole('tab', { name: 'Sua assinatura' })).toHaveCount(0)
  await expect(page.getByRole('radio', { name: /Anual/ })).toHaveCount(0)
  await expect(page.getByText('Pagamento seguro · 7 dias para desistir com reembolso')).toBeVisible()
})

test('checkout: dois passos, e no self-host o passo de pagamento diz que não há o que pagar', async ({ page }) => {
  await abrir(page, '/plano')
  /* `clicarRobusto`: a recompensa de uma conquista (fila assíncrona) pode abrir DEPOIS do
     `fecharSobreposicoes` e cobrir o botão — medido: 1 em 15 no celular com o banco compartilhado. */
  await clicarRobusto(page, page.getByRole('button', { name: 'Assinar Pro' }))
  await expect(page).toHaveURL(/\/plano\/assinar$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Assinar o Pro' })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Etapas' })).toContainText('Plano e período')

  await clicarRobusto(page, page.getByRole('button', { name: 'Ir para o pagamento' }))
  await expect(page.getByRole('heading', { name: 'Nada a pagar no self-host' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Assinar e pagar/ })).toHaveCount(0)

  // O "voltar" do cabeçalho (no desktop o "Planos" do menu faz o mesmo: volta à tela principal).
  await clicarRobusto(page, page.locator('.cab .voltar'))
  await expect(page).toHaveURL(/\/plano$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Planos' })).toBeVisible()
})

test('/plano/assinado aberto direto não comemora sem o servidor confirmar, e sobrevive ao recarregar', async ({
  page,
}) => {
  await abrir(page, '/plano/assinado')
  await expect(
    page.getByRole('heading', { name: /Ainda não recebemos a confirmação|Conferindo o pagamento/ }),
  ).toBeVisible()
  await expect(page.getByText(/Bem-vindo ao/)).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('main')).toBeVisible()
  await expect(page).toHaveURL(/\/plano\/assinado$/)
  await expect(page.getByText(/Bem-vindo ao/)).toHaveCount(0)
})
