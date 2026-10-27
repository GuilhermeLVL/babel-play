import { defineConfig, devices } from '@playwright/test'

import base from './playwright.config'

/**
 * O LEITOR NO WEBKIT (Safari) — configuração à parte, FORA da CI obrigatória: instalar o WebKit no runner é
 * pesado, e o dono lê no Safari, então esta suíte roda antes de cada merge do leitor:
 *
 *   npx playwright install webkit
 *   PORT=3197 BASE_URL=http://localhost:3197 npx playwright test -c playwright.webkit.config.ts
 *
 * Só as suítes do leitor (`leitor*.e2e.ts`), em dois aparelhos: o iPhone e o Safari do computador. O iframe do
 * capítulo não tem `allow-scripts` (`src/lib/leitor/foliate/PATCHES.md`), e o bug 218086 do WebKit é o motivo
 * de esta suíte existir: o toque na palavra e a seleção precisam funcionar AQUI, sem script no livro.
 */
export default defineConfig({
  ...base,
  /* O leitor, e o catálogo da L1 que abre nele (`/livros/<id>/ler`). */
  testMatch: ['**/leitor*.e2e.ts', '**/livros.e2e.ts'],
  projects: [
    { name: 'webkit-iphone', use: { ...devices['iPhone 13'] } },
    { name: 'webkit-desktop', use: { ...devices['Desktop Safari'], viewport: { width: 1280, height: 800 } } },
  ],
})
