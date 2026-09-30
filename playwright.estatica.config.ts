import { defineConfig, devices } from '@playwright/test'

/**
 * E2E DA EDIÇÃO ESTÁTICA — o `dist/` de `npm run build:estatica`, servido como o Cloudflare Pages
 * serve: arquivos estáticos, fallback de SPA para o `index.html` e NENHUM servidor Node.
 *
 *   npm run build:estatica
 *   npx playwright test -c playwright.estatica.config.ts
 *
 * O servidor é `tests/e2e-estatica/_servidor-estatico.mjs` (porta 4175). Se já houver um de pé
 * nessa porta, é reaproveitado — quem o subiu é quem o derruba.
 *
 * Screenshots das telas vão para `SCREENSHOTS_ESTATICA` (ou `test-results/estatica/`).
 *
 * No CI é o job `e2e-estatica` de `.github/workflows/ci.yml` (o build e os dois projetos).
 */
const PORTA = Number(process.env.PORTA_ESTATICA || 4175)

export default defineConfig({
  testDir: './tests/e2e-estatica',
  testMatch: '**/*.e2e.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'list',
  timeout: 180_000,
  use: {
    baseURL: `http://127.0.0.1:${PORTA}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop-1280', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    {
      name: 'mobile-375',
      use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true },
    },
  ],
  webServer: {
    command: `node tests/e2e-estatica/_servidor-estatico.mjs ${PORTA}`,
    url: `http://127.0.0.1:${PORTA}/`,
    reuseExistingServer: true,
    timeout: 30_000,
  },
})
