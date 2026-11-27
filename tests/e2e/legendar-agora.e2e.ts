import { expect, test } from '@playwright/test'

import { abrirTela, clicarRobusto } from './_helpers'

/**
 * LEGENDAR AGORA: para quem já legendou o som do computador, UM toque abre o seletor do navegador já
 * pré-arrumado. O seletor é obrigatório e aqui é um falso que só registra o pedido e o recusa
 * (como se a pessoa fechasse a caixa): o que se prova é o NÚMERO DE TOQUES até o `getDisplayMedia` e
 * as dicas que ele recebe. Só no desktop: celular não tem som do computador.
 */

async function seletorFalso(page: import('@playwright/test').Page, jaUsou: boolean) {
  await page.addInitScript((usou) => {
    try {
      if (usou) {
        localStorage.setItem('babel.captura.ultimaSuperficie', 'browser')
        localStorage.setItem('babel.captura.downloadConfirmado', '1')
      }
    } catch {
      /* sem armazenamento */
    }
    const w = window as unknown as { __pedidos: unknown[] }
    w.__pedidos = []
    const md = navigator.mediaDevices
    md.getSupportedConstraints = () => ({ displaySurface: true }) as MediaTrackSupportedConstraints
    md.getDisplayMedia = async (c?: DisplayMediaStreamOptions) => {
      w.__pedidos.push(c)
      throw new DOMException('cancelado', 'NotAllowedError')
    }
  }, jaUsou)
}

const pedidos = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as unknown as { __pedidos: Array<Record<string, unknown>> }).__pedidos)

test.describe('Legendar agora', () => {
  test.beforeEach(async ({ page: _p }, info) => {
    test.skip(info.project.name !== 'desktop-1280', 'só o desktop tem o som do computador')
  })

  test('quem já usou: 1 toque abre o seletor com as dicas', async ({ page }) => {
    test.slow()
    await seletorFalso(page, true)
    await abrirTela(page, '/capturar')
    const botao = page.getByTestId('legendar-agora')
    await expect(botao).toBeVisible({ timeout: 30_000 })
    await clicarRobusto(page, botao)
    await expect.poll(async () => (await pedidos(page)).length, { timeout: 15_000 }).toBe(1)
    const [p] = await pedidos(page)
    expect(p.systemAudio).toBe('include')
    expect(p.selfBrowserSurface).toBe('exclude')
    expect(p.surfaceSwitching).toBe('include')
    expect((p.video as { displaySurface?: string }).displaySurface).toBe('browser')
    expect(JSON.stringify(p)).not.toMatch(/preferCurrentTab/)
  })

  test('primeira vez: sem o botão; o Iniciar pergunta o download (2 toques)', async ({ page }) => {
    test.slow()
    await seletorFalso(page, false)
    await abrirTela(page, '/capturar')
    await expect(page.getByTestId('iniciar-captura')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('legendar-agora')).toHaveCount(0)
    await clicarRobusto(page, page.getByTestId('iniciar-captura'))
    /* Primeiro uso, aparelho sem os modelos: a pergunta do download (322 MB) é o 2º toque, e é consentimento. */
    const baixar = page.getByRole('button', { name: /Baixar e iniciar/ })
    await baixar.waitFor({ state: 'visible', timeout: 5000 })
    await baixar.click()
    await expect.poll(async () => (await pedidos(page)).length, { timeout: 15_000 }).toBe(1)
  })
})
