import { defineConfig, devices } from '@playwright/test'

/**
 * E2E NO MODO PÚBLICO (`AUTH_REQUIRED=1`) — Fase 5 do lançamento.
 *
 *   npx playwright test -c playwright.publico.config.ts
 *
 * A suíte comum (`playwright.config.ts`) roda sem login, então o caminho que a produção usa —
 * supabase-js no navegador, token ES256, servidor verificando pelo JWKS, 2FA elevando a sessão —
 * nunca passava por um navegador. Aqui ele passa, contra um Supabase Auth FALSO
 * (`tests/e2e-publico/_supabase-falso.mjs`): sem segredo no CI e sem rede externa.
 *
 * Dois servidores: o Supabase falso e o app em modo dev (Vite em middleware) com o login LIGADO e
 * apontado para ele. Banco próprio (`data/e2e-publico.db`), porta própria (3127).
 */
const PORTA = Number(process.env.PORTA_E2E_PUBLICO || 3127)
const SUPABASE = `http://127.0.0.1:${process.env.SUPABASE_FALSO_PORTA || 54399}`

export default defineConfig({
  testDir: './tests/e2e-publico',
  testMatch: '**/*.e2e.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORTA}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'desktop-1280', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } }],
  webServer: [
    {
      command: 'node tests/e2e-publico/_supabase-falso.mjs',
      url: `${SUPABASE}/auth/v1/.well-known/jwks.json`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'node node_modules/tsx/dist/cli.mjs server.ts',
      url: `http://localhost:${PORTA}/api/health`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        PORT: String(PORTA),
        NODE_ENV: 'development',
        AUTH_REQUIRED: '1',
        SUPABASE_URL: SUPABASE,
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-e2e',
        VITE_AUTH_REQUIRED: '1',
        VITE_SUPABASE_URL: SUPABASE,
        VITE_SUPABASE_ANON_KEY: 'anon-e2e',
        DATABASE_URL: process.env.DATABASE_URL_E2E_PUBLICO || 'file:./data/e2e-publico.db',
        VITE_CACHE_DIR: process.env.VITE_CACHE_DIR_E2E_PUBLICO || '',
      },
    },
  ],
})
