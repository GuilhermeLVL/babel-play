import { expect, type Page, test } from '@playwright/test'

import { violacoesGraves } from './_acessibilidade'
import { abrirTela, clicarRobusto, fecharSobreposicoes, verSemSobreposicao } from './_helpers'

/**
 * O SELO COMPACTO E O PAINEL DE PROCESSAMENTO NA CAPTURA (plano 2026-10-23, Task 4), no navegador de
 * verdade: o selo é só o ícone (o texto inteiro no nome acessível); no computador o painel é um popover
 * ancorado nele, no celular a folha de baixo. Esc fecha e o foco volta ao selo; nada rola de lado; o
 * painel aberto passa no axe (sério/crítico); "Modelos no aparelho" leva a /ajustes/processamento.
 */
test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name === 'tablet-768', 'as duas formas (popover e folha) são cobertas em 1280 e 375')
  await page.route(/huggingface\.co|hf\.co|cdn-lfs/, (r) => r.abort())
})

const estreita = (page: Page) => (page.viewportSize()?.width ?? 0) <= 720
const selo = (page: Page) => page.getByTestId('chip-de-estado')
const painel = (page: Page) => page.getByTestId('painel-de-processamento')

async function abrirPainel(page: Page) {
  await abrirTela(page, '/capturar')
  await expect(page.getByTestId('iniciar-captura')).toBeVisible({ timeout: 60_000 })
  await fecharSobreposicoes(page)
  await clicarRobusto(page, selo(page))
  await verSemSobreposicao(page, painel(page))
}

test('o selo é só o ícone, e abre o painel com o segmentado, as linhas e o rodapé', async ({ page }) => {
  test.slow()
  await abrirTela(page, '/capturar')
  await expect(selo(page)).toBeVisible({ timeout: 60_000 })
  await expect(selo(page)).toHaveText('')
  await expect(selo(page)).toHaveAttribute('aria-label', /Abrir o painel de processamento$/)
  const caixa = await selo(page).boundingBox()
  expect(Math.round(caixa?.width ?? 0)).toBeGreaterThanOrEqual(44)
  expect(Math.round(caixa?.height ?? 0)).toBeGreaterThanOrEqual(44)

  await fecharSobreposicoes(page)
  await clicarRobusto(page, selo(page))
  await verSemSobreposicao(page, painel(page))
  const p = painel(page)
  await expect(p.getByRole('radiogroup', { name: 'Onde a fala é processada' })).toBeVisible()
  await expect(p.getByRole('button', { name: /^Transcrição/ })).toBeVisible()
  await expect(p.getByRole('button', { name: 'Como isto funciona' })).toBeVisible()
  if (estreita(page)) {
    // Celular: a folha de baixo, e ela cabe na largura (B8: nada cortado à direita).
    const folha = page.locator('dialog.pp-folha')
    await expect(folha).toBeVisible()
    const r = await folha.boundingBox()
    expect((r?.x ?? -1) >= 0 && (r?.x ?? 0) + (r?.width ?? 0) <= 375 + 1).toBe(true)
  } else {
    // Computador: o popover fica dentro da janela, logo abaixo do selo.
    const r = await page.locator('.pp-pop').boundingBox()
    expect(r && r.x >= 0 && r.x + r.width <= 1280 && r.y + r.height <= 800).toBeTruthy()
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(
    true,
  )
  /* Com uma folha modal aberta, o anel do ícone "Pronto para legendar" fica PAUSADO (px-anel, 3 voltas)
     e a espera de animações de `violacoesGraves` nunca terminaria: ele vai direto ao fim. */
  await page.evaluate(() =>
    document
      .getAnimations()
      .filter((a) => a.playState === 'paused' && a.effect?.getTiming().iterations !== Infinity)
      .forEach((a) => a.finish()),
  )
  expect(await violacoesGraves(page)).toEqual([])
})

test('Esc fecha e o foco volta ao selo', async ({ page }) => {
  test.slow()
  await abrirPainel(page)
  await page.keyboard.press('Escape')
  await expect(painel(page)).toHaveCount(0)
  await expect(selo(page)).toBeFocused()
})

test('"Como isto funciona" abre a folha de sempre, inteira na tela', async ({ page }) => {
  test.slow()
  await abrirPainel(page)
  await painel(page).getByRole('button', { name: 'Como isto funciona' }).click()
  const como = page.getByTestId('como-isto-funciona')
  await verSemSobreposicao(page, como)
  const r = await page.locator('dialog.pl-como-folha').boundingBox()
  const largura = page.viewportSize()?.width ?? 0
  expect(r && r.x >= 0 && r.x + r.width <= largura + 1).toBeTruthy()
})

test('"Modelos no aparelho" leva a Ajustes → Processamento', async ({ page }) => {
  test.slow()
  await abrirPainel(page)
  await painel(page).getByRole('button', { name: 'Modelos no aparelho' }).click()
  await expect(page).toHaveURL(/\/ajustes\/processamento$/)
})
