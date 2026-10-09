import { expect, test } from '@playwright/test'

import { abrirTela, clicarRobusto } from './_helpers'

/**
 * AS TELAS DE PAGAMENTO DE PLANOS (`Planos`, `planos/Checkout`, `planos/Assinado`).
 *
 * A suíte roda no modo local (self-host, sem cobrança), e é exatamente aí que as travas de
 * dinheiro precisam segurar:
 * - o checkout existe e leva ao passo de pagamento, mas NÃO oferece pagar (nada a cobrar);
 * - a confirmação `/plano/assinado` não acredita na URL: aberta direto, sem pagamento confirmado
 *   pelo servidor, ela não comemora — e o endereço sobrevive ao recarregamento.
 *
 * NO DESENHO NOVO (09/10/2026) a tela tem TRÊS abas (Planos, Sua assinatura, Consumo do mês) em todo
 * modo, e o título é a frase do produto; o plano vigente vem escrito no alto ("Seu plano: Self-host").
 * A garantia de antes ("sem aba de assinatura") virou: a aba existe e, no self-host, diz o que é e não
 * oferece cobrança nem cancelamento.
 */

test('Planos no self-host: a assinatura diz Self-host, sem seletor anual e sem cobrança', async ({ page }) => {
  await abrirTela(page, '/plano')
  const tela = page.getByTestId('planos-do-quest')
  await expect(tela.getByRole('heading', { level: 1 })).toHaveCount(1)
  await expect(tela.getByText('Seu plano: Self-host')).toBeVisible()
  const abas = page.getByRole('tablist', { name: 'Planos' }).getByRole('tab')
  await expect(abas).toHaveText([/^Planos/, /^Sua assinatura/, /^Consumo do mês/])
  await expect(page.getByRole('radio', { name: /Anual/ })).toHaveCount(0)
  await expect(page.getByText(/Pagamento seguro · 7 dias para desistir com reembolso/)).toBeVisible()

  await clicarRobusto(page, page.getByRole('tab', { name: 'Sua assinatura' }))
  await expect(tela.getByRole('heading', { level: 2, name: 'Self-host' })).toBeVisible()
  await expect(tela.getByText(/tudo fica liberado e não há cota/)).toBeVisible()
  await expect(page.getByRole('button', { name: /Assinar e pagar|Cancelar (a )?assinatura/ })).toHaveCount(0)
})

test('checkout: dois passos, e no self-host o passo de pagamento diz que não há o que pagar', async ({ page }) => {
  await abrirTela(page, '/plano')
  /* `clicarRobusto`: a recompensa de uma conquista (fila assíncrona) pode abrir DEPOIS do
     `fecharSobreposicoes` e cobrir o botão — medido: 1 em 15 no celular com o banco compartilhado. */
  await clicarRobusto(page, page.getByRole('button', { name: 'Assinar Premium' }))
  await expect(page).toHaveURL(/\/plano\/assinar$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Assinar o Premium' })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Etapas' })).toContainText('Plano e período')

  await clicarRobusto(page, page.getByRole('button', { name: 'Ir para o pagamento' }))
  await expect(page.getByRole('heading', { name: 'Nada a pagar no self-host' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Assinar e pagar/ })).toHaveCount(0)

  // O "voltar" do cabeçalho devolve à tela de Planos.
  await clicarRobusto(page, page.getByRole('button', { name: 'Voltar para Planos' }))
  await expect(page).toHaveURL(/\/plano$/)
  await expect(page.getByTestId('planos-do-quest')).toBeVisible()
})

test('/plano/assinado aberto direto não comemora sem o servidor confirmar, e sobrevive ao recarregar', async ({
  page,
}) => {
  await abrirTela(page, '/plano/assinado')
  await expect(
    page.getByRole('heading', { name: /Ainda não recebemos a confirmação|Conferindo o pagamento/ }),
  ).toBeVisible()
  await expect(page.getByText(/Bem-vindo ao/)).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('main')).toBeVisible()
  await expect(page).toHaveURL(/\/plano\/assinado$/)
  await expect(page.getByText(/Bem-vindo ao/)).toHaveCount(0)
})
