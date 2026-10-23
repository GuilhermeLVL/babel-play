import { expect, type Page, test } from '@playwright/test'

import { abrirTela, fecharSobreposicoes, trilho } from './_helpers'

/**
 * CURSOR E DICA DO TRILHO COM O TAMANHO DO TEXTO (P/M/G).
 *
 * O tamanho do texto é `zoom` no `document.body` (`useAparencia.ts`). Dentro do body, `px` já é multiplicado
 * pelo zoom, mas `clientX/Y` e `getBoundingClientRect()` vêm em px da JANELA. Gravar um como o outro
 * deslocava o cursor personalizado (o dono: "o mouse perde a precisão") e a dica do trilho compacto.
 *
 * Aqui, nos três tamanhos: o centro do ponto do cursor fica a ≤ 2 px do mouse, e a dica do trilho em
 * 1280×800 fica à direita do item e alinhada ao centro dele (≤ 4 px). Vale para cada motor do Playwright.
 */
const ESCALAS = [
  ['sm', 'P'],
  ['md', 'M'],
  ['xl', 'G'],
] as const

const centro = async (page: Page, seletor: string) =>
  page.evaluate((s) => {
    const r = document.querySelector(s)!.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, right: r.right }
  }, seletor)

test.describe('tamanho do texto: cursor e dica do trilho', () => {
  test.beforeEach(({ browserName: _ }, info) => {
    test.skip(info.project.name !== 'desktop-1280', 'fixa a janela sozinho')
  })

  for (const [escala, rotulo] of ESCALAS) {
    test(`tamanho ${rotulo}: o ponto do cursor fica sob o mouse`, async ({ page }) => {
      await page.addInitScript((e) => localStorage.setItem('babel.font_scale', e), escala)
      await page.setViewportSize({ width: 1280, height: 800 })
      await abrirTela(page, '/')
      await fecharSobreposicoes(page)
      await expect(page.locator('html')).toHaveClass(/px-com-cursor/)
      for (const [x, y] of [
        [640, 400],
        [900, 300],
        [300, 650],
      ]) {
        await page.mouse.move(x, y, { steps: 4 })
        await page.waitForTimeout(50)
        const c = await centro(page, '.px-cursor-ponto')
        expect(Math.abs(c.x - x), `x do ponto (${rotulo})`).toBeLessThanOrEqual(2)
        expect(Math.abs(c.y - y), `y do ponto (${rotulo})`).toBeLessThanOrEqual(2)
      }
    })

    test(`tamanho ${rotulo}: a dica do trilho compacto fica ao lado do item`, async ({ page }) => {
      await page.addInitScript((e) => localStorage.setItem('babel.font_scale', e), escala)
      await page.setViewportSize({ width: 1280, height: 800 })
      await abrirTela(page, '/')
      await fecharSobreposicoes(page)
      const item = trilho(page).locator('.q-item[data-dica]').first()
      await expect(item).toBeVisible({ timeout: 10_000 })
      await item.hover()
      const dica = page.locator('.q-dica')
      await expect(dica).toBeVisible({ timeout: 3000 })
      const alvo = await item.evaluate((el) => {
        const r = el.getBoundingClientRect()
        return { right: r.right, cy: r.top + r.height / 2 }
      })
      const d = await dica.evaluate((el) => {
        const r = el.getBoundingClientRect()
        return { left: r.left, cy: r.top + r.height / 2 }
      })
      expect(d.left, 'a dica começa à direita do item').toBeGreaterThanOrEqual(alvo.right - 1)
      expect(d.left - alvo.right, 'e perto dele').toBeLessThanOrEqual(24)
      expect(Math.abs(d.cy - alvo.cy), 'alinhada ao centro').toBeLessThanOrEqual(4)
    })
  }
})
