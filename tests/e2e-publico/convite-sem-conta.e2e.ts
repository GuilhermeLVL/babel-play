/**
 * O CONVITE SOZINHO NA TELA. Sem conta, Estatísticas mostrava o cartão "Esta parte precisa de conta"
 * no topo e a tela inteira (números zerados, abas, gráfico) por baixo dele. Agora o cartão é a tela:
 * centrado, e nada de Estatísticas monta atrás.
 */
import { expect, test } from '@playwright/test'

test('sem conta, /estatisticas mostra só o convite, centrado', async ({ page }) => {
  await page.goto('/estatisticas')
  const cartao = page.getByTestId('cartao-de-convite')
  await expect(cartao).toContainText('Esta parte precisa de conta', { timeout: 60_000 })
  await expect(page.getByRole('heading', { name: 'Estatísticas', exact: true })).toHaveCount(0)
  await expect(page.getByText('Minutos por dia')).toHaveCount(0)

  const titulo = await cartao.getByText('Esta parte precisa de conta').boundingBox()
  const tela = page.viewportSize()
  expect(titulo && tela).toBeTruthy()
  /* O título fica na metade de cima/do meio, longe do topo onde o cartão ficava preso. */
  const meio = titulo!.y + titulo!.height / 2
  expect(Math.abs(meio - tela!.height / 2)).toBeLessThan(tela!.height * 0.25)
})
