import { expect, test } from '@playwright/test'

import { conteudoPadraoNoServidor, semearCartoes } from './_fixtures'
import { abrirTela, assentar, clicarRobusto, fecharSobreposicoes, telaDeCartoes } from './_helpers'
import { comFlags } from './_interprete'

/**
 * A REVISÃO V2 NA TELA CARTÕES (flag `estudo_revisao_v2`; openspec `cartoes` 9.1): com a flag ligada a tecla "?" abre a
 * lista de atalhos (da tela e da revisão) e o "…" tem UM "Importar", UM "Exportar" e a linha "Atalhos" com
 * `aria-keyshortcuts`. Com a flag desligada nada disso existe: o menu é o de sempre e a tecla não faz nada.
 */
test.beforeAll(async () => {
  await semearCartoes()
})
test.beforeEach(async () => {
  await conteudoPadraoNoServidor()
})

async function abrirMais(page: import('@playwright/test').Page) {
  await clicarRobusto(page, page.getByTestId('mais-de-cartoes'))
  const menu = page.getByRole('dialog', { name: 'Mais opções' })
  await expect(menu).toBeVisible()
  return menu
}

test.describe('Cartões: revisão v2', () => {
  test('flag ligada: "?" abre os atalhos; o menu tem Importar, Exportar e Atalhos', async ({ page }) => {
    test.slow()
    await comFlags(page, { estudo_revisao_v2: true })
    await abrirTela(page, '/cartoes')
    await fecharSobreposicoes(page)
    await expect(telaDeCartoes(page)).toBeVisible()
    await page.keyboard.press('?')
    const dialogo = page.getByRole('dialog', { name: 'Atalhos e gestos' })
    await expect(dialogo).toBeVisible()
    await expect(dialogo.getByTestId('atalhos-da-tela')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialogo).toBeHidden()

    const menu = await abrirMais(page)
    await expect(menu.getByRole('button', { name: /^Importar/ })).toBeVisible()
    await expect(menu.getByRole('button', { name: /^Exportar/ })).toBeVisible()
    await expect(menu.getByRole('button', { name: /^Trazer e levar/ })).toHaveCount(0)
    await expect(menu.getByRole('button', { name: /^Atalhos/ })).toHaveAttribute('aria-keyshortcuts', '?')
  })

  test('flag desligada: "?" não faz nada e o menu é o de sempre', async ({ page }) => {
    test.slow()
    await comFlags(page, { estudo_revisao_v2: false })
    await abrirTela(page, '/cartoes')
    await fecharSobreposicoes(page)
    await expect(telaDeCartoes(page)).toBeVisible()
    await page.keyboard.press('?')
    await assentar(page)
    await expect(page.getByRole('dialog', { name: 'Atalhos e gestos' })).toHaveCount(0)
    const menu = await abrirMais(page)
    await expect(menu.getByRole('button', { name: /^Trazer e levar/ })).toBeVisible()
    await expect(menu.getByRole('button', { name: /^Atalhos/ })).toHaveCount(0)
  })
})
