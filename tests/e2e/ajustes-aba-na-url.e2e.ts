import { expect, test } from '@playwright/test'

import { abrirTela, clicarRobusto } from './_helpers'

/**
 * A ABA DOS AJUSTES TEM ENDEREÇO (`/ajustes/<aba>`). Abrir o link abre a aba; trocar de aba muda a
 * barra sem empilhar histórico; aba desconhecida cai em `/ajustes`. "contas" é a aba Processamento.
 */
test.describe('Ajustes: aba na URL', () => {
  test('abrir o link abre a aba, e trocar de aba usa replaceState', async ({ page }) => {
    await abrirTela(page, '/ajustes/privacidade')
    await expect(page.getByRole('tab', { name: /Privacidade/ })).toHaveAttribute('aria-selected', 'true')

    const entradas = await page.evaluate(() => history.length)
    await clicarRobusto(page, page.getByRole('tab', { name: /Idiomas/ }))
    await expect(page).toHaveURL(/\/ajustes\/idiomas$/)
    await clicarRobusto(page, page.getByRole('tab', { name: /Processamento/ }))
    await expect(page).toHaveURL(/\/ajustes\/processamento$/)
    expect(await page.evaluate(() => history.length)).toBe(entradas)
  })

  test('/ajustes/processamento abre Processamento; aba desconhecida cai em /ajustes', async ({ page }) => {
    await abrirTela(page, '/ajustes/processamento')
    await expect(page.getByRole('tab', { name: /Processamento/ })).toHaveAttribute('aria-selected', 'true')

    await abrirTela(page, '/ajustes/inventada')
    await expect(page.getByRole('tab', { name: /Idiomas/ })).toHaveAttribute('aria-selected', 'true')
    await expect(page).toHaveURL(/\/ajustes$/)
  })
})
