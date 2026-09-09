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
  /* Banco vazio abre no Onboarding e nenhum teste encontra `<main>`. Ver `_global-setup.ts`. */
  globalSetup: './tests/e2e/_global-setup.ts',
  /**
   * UM WORKER, SEMPRE — e a razão não é lentidão de máquina.
   *
   * O app roda em modo self-host com UM usuário local (`AUTH_REQUIRED` desligada): todos os
   * workers batem no MESMO banco e no MESMO estado de usuário. Enquanto os testes só liam a tela,
   * o paralelismo passava por sorte; desde que passaram a escolher baralho e ligar recortes (que
   * gravam filtro no servidor e no localStorage), dois workers disputam a mesma escolha e um
   * derruba o outro — falha que aparece só em paralelo e some no teste isolado, o pior tipo de
   * intermitência para diagnosticar.
   *
   * Serial custa ~1 minuto na suíte inteira. Paralelo custava confiança no resultado.
   */
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    // Um worktree roda o seu próprio servidor noutra porta; sem isto a suíte testaria o app da
    // pasta principal e reportaria falhas que não são do código sob teste.
    baseURL: process.env.BASE_URL || 'http://localhost:3100',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  /**
   * TRES VIEWPORTS, UM MOTOR. O app tem duas molduras de navegacao (dock inferior abaixo de
   * `md`, barra/rail acima) e telas que rolam de lado no celular. Um projeto so, de desktop,
   * passava sem tocar na dock — e a dock foi justamente onde a auditoria achou a tela sem porta
   * (`MobileNav.tsx`, F9). Os tres rodam em serie (workers: 1, ver acima), no mesmo banco.
   */
  projects: [
    {
      name: 'mobile-375',
      use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true },
    },
    {
      name: 'tablet-768',
      use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } },
    },
    {
      name: 'desktop-1280',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: {
    command: 'npm run dev:local',
    url: process.env.BASE_URL || 'http://localhost:3100',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
