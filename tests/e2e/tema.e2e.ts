import { expect, type Page, test } from '@playwright/test'

import { uiDoServidor } from './_fixtures'
import { abrirMais, abrirTela, clicarRobusto, fecharSobreposicoes } from './_helpers'

/**
 * CLARO/ESCURO PERSISTE NAS DUAS CAMADAS.
 *
 * `persistTheme` (lib/theme.ts) grava em `localStorage['theme']` na hora e em `settings.ui.darkMode`
 * com debounce de 400 ms. O F5 tem de reabrir escuro por causa da primeira camada (`bootTheme`
 * pinta antes do React), e um navegador limpo tem de reabrir escuro por causa da segunda
 * (`hydrateTheme`). O teste prova as duas: recarrega, e depois abre um contexto novo sem storage.
 *
 * NO DESENHO NOVO (09/10/2026) o interruptor mora no pé do painel "Mais" (`TrilhoDoQuest`), que é a
 * mesma peça no computador, no tablet e na barra de cinco do celular: o botão diz o tema VIGENTE
 * ("Tema claro" / "Tema escuro") e o toque troca. O botão "Mudar para o modo escuro" do cabeçalho
 * de antes não existe mais.
 */

/** O interruptor do tema, no pé do "Mais" (abre o painel se preciso). */
async function botaoDoTema(page: Page) {
  const mais = await abrirMais(page)
  return mais.getByRole('button', { name: /^Tema (claro|escuro)$/ })
}

test.describe('Tema', () => {
  test('alternar para o escuro sobrevive ao F5 e a um navegador limpo', async ({ page, browser }) => {
    test.slow()
    await abrirTela(page, '/ajustes')

    /* Garante o ponto de partida (claro), seja qual for o estado deixado por outro projeto. */
    let tema = await botaoDoTema(page)
    if ((await tema.textContent())?.trim() === 'Tema escuro') {
      await clicarRobusto(page, tema)
      await expect(tema).toHaveText('Tema claro')
      await page.waitForTimeout(700)
    }
    await expect(page.locator('html')).not.toHaveClass(/\bdark\b/)

    await clicarRobusto(page, tema)
    await expect(tema, 'o botão passa a dizer o tema vigente').toHaveText('Tema escuro')
    await expect(page.locator('html')).toHaveClass(/\bdark\b/)
    expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe('dark')

    /* A camada durável chega com debounce; espera-se pelo servidor, não por um sleep fixo. */
    await expect.poll(async () => (await uiDoServidor()).darkMode, { timeout: 10_000 }).toBe(true)

    await page.reload()
    await expect(page.getByRole('main')).toBeVisible()
    await expect(page.locator('html'), 'o F5 deveria reabrir escuro').toHaveClass(/\bdark\b/)
    await fecharSobreposicoes(page)
    tema = await botaoDoTema(page)
    await expect(tema).toHaveText('Tema escuro')

    /* Navegador limpo: sem localStorage, só o servidor sabe. */
    const limpo = await browser.newContext({ viewport: page.viewportSize() ?? undefined })
    const outra = await limpo.newPage()
    await outra.goto('/ajustes')
    await expect(outra.getByRole('main')).toBeVisible()
    await expect(outra.locator('html'), 'um contexto sem storage deveria hidratar o escuro do servidor').toHaveClass(
      /\bdark\b/,
      { timeout: 10_000 },
    )
    await limpo.close()

    /* Devolve o claro para não contaminar as outras suítes (as capturas de tela ficam legíveis). */
    await clicarRobusto(page, tema)
    await expect(tema).toHaveText('Tema claro')
    await expect(page.locator('html')).not.toHaveClass(/\bdark\b/)
    await expect.poll(async () => (await uiDoServidor()).darkMode, { timeout: 10_000 }).toBe(false)
  })
})
