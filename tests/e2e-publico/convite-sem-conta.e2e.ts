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

  const tela = page.viewportSize()!
  /* O título fica na metade de cima/do meio, longe do topo onde o cartão ficava preso. O cartão ainda
     está assentando quando aparece, então a posição é medida até estabilizar (não numa foto só). */
  await expect
    .poll(async () => {
      const caixa = await cartao.getByText('Esta parte precisa de conta').boundingBox()
      return caixa ? Math.abs(caixa.y + caixa.height / 2 - tela.height / 2) : Infinity
    })
    .toBeLessThan(tela.height * 0.25)
})
