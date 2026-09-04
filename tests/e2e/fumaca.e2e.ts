import { test, expect } from '@playwright/test';

/**
 * Fumaça: só o que existe hoje, comprovado de verdade (sem login — `npm run dev:local` desliga
 * `VITE_AUTH_REQUIRED`). Rótulos de navegação vêm de `src/components/shell/navItems.ts`: o perfil
 * padrão de uma visita nova é 'senior' (decisão do dono, spec leitura-ampliada-padrao — ver
 * `src/lib/profile.ts:41-45`), então usamos os rótulos do perfil sênior, não os `short`.
 */

test('a casca do app carrega e a navegação principal aparece', async ({ page }) => {
  await page.goto('/');

  // A navegação real (nav/rail) expõe os itens como links/botões com role de navegação.
  await expect(page.getByRole('link', { name: 'Página Inicial' }).or(page.getByRole('button', { name: 'Página Inicial' }))).toBeVisible();
  await expect(page.getByRole('link', { name: 'Praticar' }).or(page.getByRole('button', { name: 'Praticar' }))).toBeVisible();
});

test('a navegação leva até a tela de jogos (Praticar) e ela renderiza', async ({ page }) => {
  await page.goto('/');

  const praticar = page.getByRole('link', { name: 'Praticar' }).or(page.getByRole('button', { name: 'Praticar' }));
  await praticar.click();

  // Prova de renderização: a URL espelha o estado (`src/lib/rotas.ts`) — a view `play` publica
  // `/jogar`, não `/play` — e algo do conteúdo da tela aparece.
  await expect(page).toHaveURL(/\/jogar/);
  await expect(page.getByRole('main')).toBeVisible();
});
