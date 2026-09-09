import { test } from '@playwright/test';

/**
 * LOGIN — fora desta suite de proposito. O `webServer` e `npm run dev:local`, sem Supabase; a
 * tela `<Login/>` nem monta (`authRequired` falso). O fluxo HTTP de conta esta coberto em
 * `tests/caracterizacao/auth-e-conta.test.ts`.
 */
test.skip('login real exige projeto Supabase de teste; coberto em tests/caracterizacao/auth-e-conta.test.ts (HTTP)', () => {
  // ver docblock
});
