import { expect, type Page, test } from '@playwright/test'

import { assentar, clicarRobusto } from './_helpers'

/**
 * A NAVEGAÇÃO "O INÍCIO É O MENU" NO NAVEGADOR DE VERDADE (flag `navegacao_simples`, ligada aqui por `page.route`; openspec
 * `navegacao-mais-simples`, opção 3). No computador e no celular: sem trilho, sem "Mais" e sem barra de baixo; o Ao vivo abre
 * do Início em UM toque, no último modo; "‹ Início" volta; o sino abre os avisos direto; o avatar abre "Configurações"; Esc devolve o
 * foco a quem abriu; Ctrl+K abre a busca de sempre. Nenhum modelo é baixado: só a navegação é medida.
 */
async function abrir(page: Page, caminho: string, ligada = true) {
  await page.route(/huggingface\.co|hf\.co|cdn-lfs/, (r) => r.abort())
  await page.route('**/api/flags', (r) =>
    r.fulfill({ json: { flags: ligada ? { navegacao_simples: { ligada: true } } : {} } }),
  )
  await page.goto(caminho)
  await expect(page.getByRole('main')).toBeVisible({ timeout: 20_000 })
  await assentar(page)
}

test('com a flag desligada, o trilho de hoje continua', async ({ page }) => {
  await abrir(page, '/', false)
  await expect(page.locator('.q-trilho')).toBeVisible()
  await expect(page.getByTestId('cabecalho-simples')).toHaveCount(0)
})

test('sem trilho, sem "Mais" e sem barra; o Início é a grade', async ({ page }) => {
  await abrir(page, '/')
  await expect(page.getByTestId('inicio-menu')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('cabecalho-simples')).toBeVisible()
  await expect(page.locator('.q-trilho')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Mais/ })).toHaveCount(0)
  const menu = page.getByTestId('inicio-menu')
  for (const id of ['progresso', 'personalizar', 'planos']) await expect(menu.getByTestId(`bloco-${id}`)).toBeVisible()
  /* Planos fecha a última fileira, na mesma linha de Progresso e Personalizar (no computador). */
  const caixa = async (id: string) => (await menu.getByTestId(`bloco-${id}`).boundingBox())!
  const [progresso, planos] = [await caixa('progresso'), await caixa('planos')]
  if ((page.viewportSize()?.width ?? 0) > 1023) expect(Math.abs(planos.y - progresso.y)).toBeLessThan(2)
  /* Sem a barra de baixo, o palco não reserva os 156 px dela. */
  const reserva = await page
    .locator('.q-palco')
    .first()
    .evaluate((el) => parseFloat(getComputedStyle(el).paddingBottom))
  expect(reserva).toBeLessThan(120)
})

test('Início → Ao vivo em 1 toque, no último modo, e o modo troca dentro da tela', async ({ page }) => {
  await abrir(page, '/')
  await page.evaluate(() => localStorage.setItem('babel.aoVivo.ultima', 'interprete'))
  await page.reload()
  await expect(page.getByTestId('inicio-menu')).toBeVisible({ timeout: 20_000 })
  await assentar(page)
  await clicarRobusto(page, page.getByTestId('bloco-ao-vivo'))
  await expect(page).toHaveURL(/\/interprete$/, { timeout: 10_000 })
  await expect(page.getByTestId('modo-conversar')).toHaveAttribute('aria-pressed', 'true')
  await clicarRobusto(page, page.getByTestId('modo-legendar'))
  await expect(page).toHaveURL(/\/capturar$/, { timeout: 10_000 })
  await expect(page.getByTestId('modo-legendar')).toHaveAttribute('aria-pressed', 'true')
  /* Pronta para legendar (sem gravar), a navegação continua à vista. */
  await expect(page.getByTestId('modo-legendar')).toBeVisible()
  await expect(page.getByTestId('voltar-ao-inicio')).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('babel.aoVivo.ultima'))).toBe('capture')
})

test('"‹ Início" volta ao menu a partir de uma tela interna', async ({ page }) => {
  await abrir(page, '/cartoes')
  const cab = page.getByTestId('cabecalho-simples')
  await expect(cab).toContainText('Cartões', { timeout: 20_000 })
  await clicarRobusto(page, page.getByTestId('voltar-ao-inicio'))
  await expect(page.getByTestId('inicio-menu')).toBeVisible({ timeout: 10_000 })
  expect(new URL(page.url()).pathname).toMatch(/^\/(app\/?)?$/)
})

test('o sino abre os avisos direto, e Esc devolve o foco ao sino', async ({ page }) => {
  await abrir(page, '/jogar')
  const sino = page.getByTestId('sino')
  await clicarRobusto(page, sino)
  const painel = page.getByTestId('painel-de-avisos')
  await expect(painel).toBeVisible()
  await expect(painel.getByRole('heading', { name: 'Avisos' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(painel).toBeHidden()
  await expect(sino).toBeFocused()
})

test('o avatar abre "Configurações" (interruptores role=switch), e Esc devolve o foco', async ({ page }) => {
  await abrir(page, '/jogar')
  const avatar = page.getByTestId('avatar-da-conta')
  await clicarRobusto(page, avatar)
  const painel = page.getByTestId('painel-da-conta')
  await expect(painel).toBeVisible()
  await expect(painel.getByRole('heading', { name: 'Configurações' })).toBeVisible()
  for (const nome of ['Ajustes', 'Seu perfil', 'Ajuda e suporte', 'Sobre'])
    await expect(painel.getByRole('button', { name: new RegExp(`^${nome}`) })).toBeVisible()
  await expect(painel.getByRole('button', { name: /^(Progresso|Personalizar|Seu plano)/ })).toHaveCount(0)
  await expect(painel.getByRole('switch')).toHaveCount(3)
  await page.keyboard.press('Escape')
  await expect(painel).toBeHidden()
  await expect(avatar).toBeFocused()
  await clicarRobusto(page, avatar)
  await clicarRobusto(page, page.getByTestId('painel-da-conta').getByRole('button', { name: /^Ajustes/ }))
  await expect(page).toHaveURL(/\/ajustes/, { timeout: 10_000 })
})

test('Ctrl+, continua abrindo Ajustes', async ({ page }) => {
  await abrir(page, '/jogar')
  await page.getByTestId('cabecalho-simples').waitFor()
  await page.keyboard.press('Control+,')
  await expect(page).toHaveURL(/\/ajustes/, { timeout: 10_000 })
  await expect(page.getByTestId('cabecalho-simples')).toContainText('Ajustes')
})

test('Ctrl+K abre a busca de sempre, em qualquer tela', async ({ page }) => {
  await abrir(page, '/biblioteca')
  await page.getByTestId('cabecalho-simples').waitFor()
  await page.keyboard.press('Control+k')
  await expect(page.getByRole('combobox')).toBeVisible({ timeout: 10_000 })
})
