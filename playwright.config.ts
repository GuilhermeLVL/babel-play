import { defineConfig, devices } from '@playwright/test';

/**
 * Suíte e2e MÍNIMA (primeira do projeto). `testMatch` restrito a `*.e2e.ts` para não colidir
 * com o vitest, que já pega `tests/**\/*.test.ts` — as duas suítes convivem na mesma pasta `tests/`.
 *
 * `webServer` sobe `npm run dev:local` (Express + Vite em modo middleware, um processo só, sem
 * login — ver `subir-dev.mjs`) na porta 3100. `reuseExistingServer` fora de CI: se você já tem o
 * servidor de pé num terminal (fluxo normal de trabalho aqui), o Playwright reaproveita em vez de
 * subir um segundo. `timeout` generoso porque o boot roda migração do SQLite antes de responder.
 */
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3100',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev:local',
    url: 'http://localhost:3100',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
