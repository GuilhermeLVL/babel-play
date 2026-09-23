import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

import { expect, type Page, test } from '@playwright/test'

import { fecharSobreposicoes } from './_helpers'

/**
 * FUNDAÇÃO (23/09/2026) — o que o shell novo promete e o que as duas telas-molde garantem.
 *
 * - Início e Ajustes sem violação WCAG 2.2 AA séria ou crítica (axe injetado direto: `axe-core`
 *   já é dependência, e o wrapper do Playwright seria um pacote a mais para a mesma coisa).
 * - Nenhuma tela rola de lado, em nenhum dos três tamanhos.
 * - Menu lateral: recolhe por botão e por Ctrl+B, e lembra ao recarregar.
 * - iChat fixo: divide a linha com o conteúdo, a largura muda pela alça e volta a flutuar sozinho
 *   quando a janela fica estreita demais.
 */
const AXE = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8')

async function abrir(page: Page, caminho = '/') {
  await page.goto(caminho)
  await expect(page.getByRole('main')).toBeVisible()
  await fecharSobreposicoes(page)
}

async function violacoesGraves(page: Page) {
  /* Espera as animações de entrada terminarem: no meio de um fade o texto está semitransparente,
     e o axe mede a cor MISTURADA — acusava 4,17:1 num rótulo que, parado, passa com folga. */
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  )
  await page.addScriptTag({ content: AXE })
  return page.evaluate(async () => {
    type No = { target: string[]; any: { data?: { fgColor?: string; bgColor?: string; contrastRatio?: number } }[] }
    const axe = (
      window as unknown as {
        axe: {
          run: (ctx: unknown, opts: unknown) => Promise<{ violations: { id: string; impact: string; nodes: No[] }[] }>
        }
      }
    ).axe
    /* A marca (logotipo) fica de fora: WCAG 1.4.3 isenta logotipos do contraste mínimo. */
    const r = await axe.run(
      { exclude: [['.font-marca']] },
      {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
      },
    )
    return r.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map(
        (v) =>
          `${v.id}: ${v.nodes
            .slice(0, 4)
            .map((n) => {
              const x = n.any[0]?.data
              return (
                n.target.join(' ') + (x?.contrastRatio ? ` (${x.fgColor} sobre ${x.bgColor} = ${x.contrastRatio})` : '')
              )
            })
            .join(' | ')}`,
      )
  })
}

const semRolagemLateral = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)

for (const [nome, caminho] of [
  ['Início', '/'],
  ['Ajustes', '/ajustes'],
] as const) {
  test(`${nome}: um h1, sem violação grave de acessibilidade e sem rolagem lateral`, async ({ page }) => {
    await abrir(page, caminho)
    await expect(page.locator('h1')).toHaveCount(1)
    expect(await violacoesGraves(page)).toEqual([])
    expect(await semRolagemLateral(page)).toBe(true)
  })
}

test.describe('shell de tela grande', () => {
  test.beforeEach(({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) < 768, 'o menu lateral e o iChat fixo são de tela grande')
  })

  test('menu lateral recolhe por botão e por Ctrl+B, e lembra ao recarregar', async ({ page }) => {
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('fundacao-e2e')) {
        localStorage.removeItem('babel.rail_collapsed')
        localStorage.setItem('babel.menu_position', 'left')
        sessionStorage.setItem('fundacao-e2e', '1')
      }
    })
    await abrir(page)
    const rail = page.locator('[data-shell="rail"]')
    await expect(rail).toBeVisible()
    const larguraAberta = (await rail.boundingBox())!.width

    await page.getByRole('button', { name: 'Recolher o menu lateral' }).click()
    await expect.poll(async () => (await rail.boundingBox())!.width).toBeLessThan(larguraAberta)

    // Recolhido, o item mostra o nome numa dica visível ao passar o mouse.
    await rail.getByRole('button', { name: /^(Início|Página Inicial)$/ }).hover()
    await expect(page.getByRole('tooltip')).toBeVisible()

    await page.reload()
    await expect(page.getByRole('button', { name: 'Expandir o menu lateral' })).toBeVisible()

    await page
      .locator('body')
      .click({ position: { x: 5, y: 5 } })
      .catch(() => {})
    await page.keyboard.press('Control+b')
    await expect(page.getByRole('button', { name: 'Recolher o menu lateral' })).toBeVisible()
  })

  test('iChat fixo divide a linha, muda de largura e volta a flutuar em janela estreita', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.addInitScript(() => {
      localStorage.setItem('ichat_docked', 'true')
      localStorage.setItem('ichat_largura', '400')
    })
    await abrir(page)
    await page.getByRole('button', { name: 'Abrir o iChat, seu tutor de estudos' }).click()

    const alca = page.getByRole('separator', { name: 'Largura do iChat' })
    await expect(alca).toBeVisible()
    const principal = page.getByRole('main')
    const antes = (await principal.boundingBox())!.width

    await alca.focus()
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowLeft')
    await expect(alca).toHaveAttribute('aria-valuenow', '432')
    await expect.poll(async () => (await principal.boundingBox())!.width).toBeLessThan(antes)
    expect(await semRolagemLateral(page)).toBe(true)

    // Janela estreita: 800 − rail − 432 deixaria o conteúdo abaixo de 440 px → o chat flutua.
    await page.setViewportSize({ width: 800, height: 800 })
    await expect(alca).toBeHidden()
    await expect(page.getByRole('button', { name: 'Fixar o iChat na lateral direita' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(await semRolagemLateral(page)).toBe(true)

    // Com espaço de novo, a escolha de fixar volta sozinha.
    await page.setViewportSize({ width: 1280, height: 800 })
    await expect(alca).toBeVisible()
  })
})
