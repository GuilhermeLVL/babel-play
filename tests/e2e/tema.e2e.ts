import { test, expect } from '@playwright/test';
import { fecharSobreposicoes, clicarRobusto } from './_helpers';
import { uiDoServidor } from './_fixtures';

/**
 * CLARO/ESCURO PERSISTE NAS DUAS CAMADAS.
 *
 * `persistTheme` (lib/theme.ts) grava em `localStorage['theme']` na hora e em `settings.ui.darkMode`
 * com debounce de 400 ms. O F5 tem de reabrir escuro por causa da primeira camada (`bootTheme`
 * pinta antes do React), e um navegador limpo tem de reabrir escuro por causa da segunda
 * (`hydrateTheme`). O teste prova as duas: recarrega, e depois abre um contexto novo sem storage.
 *
 * O botao mora no `ControlCluster`, que e a unica peca montada em todas as molduras — inclusive a
 * barra do celular (`MobileTopBar`). E por isso que este teste vale nos tres viewports sem
 * abrir menu nenhum.
 */

test.describe('Tema', () => {
  test('alternar para o escuro sobrevive ao F5 e a um navegador limpo', async ({ page, browser }) => {
    test.slow();
    await page.goto('/ajustes');
    await expect(page.getByRole('main')).toBeVisible();
    await fecharSobreposicoes(page);

    /* Garante o ponto de partida (claro), seja qual for o estado deixado por outro projeto. */
    const paraEscuro = page.getByRole('button', { name: 'Mudar para o modo escuro' });
    const paraClaro = page.getByRole('button', { name: 'Mudar para o modo claro' });
    if (await paraClaro.isVisible().catch(() => false)) {
      await clicarRobusto(page, paraClaro);
      await expect(paraEscuro).toBeVisible();
      await page.waitForTimeout(700);
    }
    await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);

    await clicarRobusto(page, paraEscuro);
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);
    expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe('dark');

    /* A camada duravel chega com debounce; espera-se pelo servidor, nao por um sleep fixo. */
    await expect.poll(async () => (await uiDoServidor()).darkMode, { timeout: 10_000 }).toBe(true);

    await page.reload();
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.locator('html'), 'o F5 deveria reabrir escuro').toHaveClass(/\bdark\b/);
    await expect(page.getByRole('button', { name: 'Mudar para o modo claro' })).toBeVisible();

    /* Navegador limpo: sem localStorage, so o servidor sabe. */
    const limpo = await browser.newContext({ viewport: page.viewportSize() ?? undefined });
    const outra = await limpo.newPage();
    await outra.goto('/ajustes');
    await expect(outra.getByRole('main')).toBeVisible();
    await expect(outra.locator('html'), 'um contexto sem storage deveria hidratar o escuro do servidor').toHaveClass(/\bdark\b/, { timeout: 10_000 });
    await limpo.close();

    /* Devolve o claro para nao contaminar as outras suites (as capturas de tela ficam legiveis). */
    await clicarRobusto(page, page.getByRole('button', { name: 'Mudar para o modo claro' }));
    await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
    await expect.poll(async () => (await uiDoServidor()).darkMode, { timeout: 10_000 }).toBe(false);
  });
});
