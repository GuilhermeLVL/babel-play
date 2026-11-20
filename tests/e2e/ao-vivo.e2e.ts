import { expect, test } from '@playwright/test'

import { abrirAoVivo, assentar, clicarRobusto, trilho } from './_helpers'

/**
 * O "AO VIVO" NO NAVEGADOR DE VERDADE: o item único do trilho (e da barra de cinco do celular) abre a
 * escolha rápida; Intérprete leva à conversa, Legendar à captura, a última escolha fica lembrada e Esc
 * devolve o foco ao item. Nenhum modelo é baixado: só a navegação é medida.
 */
test.beforeEach(async ({ page }) => {
  await page.route(/huggingface\.co|hf\.co|cdn-lfs/, (r) => r.abort())
  await page.goto('/')
  await expect(page.getByRole('main')).toBeVisible()
  await assentar(page)
})

test('trilho → Ao vivo → Intérprete: abre a conversa e o item fica marcado', async ({ page }) => {
  const menu = await abrirAoVivo(page)
  await expect(menu.getByRole('menuitem')).toHaveText([/Legendar/, /Intérprete/])
  await clicarRobusto(page, menu.getByRole('menuitem', { name: /^Intérprete/ }))
  await expect(page).toHaveURL(/\/interprete$/, { timeout: 10_000 })
  await expect(page.getByRole('menu')).toHaveCount(0)
  await expect(trilho(page).locator('.q-item[data-px-rota="capture"]')).toHaveAttribute('aria-current', 'page')
})

test('a última escolha volta pré-selecionada, com o foco, e Esc devolve o foco ao item', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('babel.aoVivo.ultima', 'interprete'))
  const item = trilho(page).locator('.q-item[data-px-rota="capture"]')
  const menu = await abrirAoVivo(page)
  await expect(menu.getByRole('menuitem', { name: /^Intérprete/ })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  await expect(item).toBeFocused()
})
