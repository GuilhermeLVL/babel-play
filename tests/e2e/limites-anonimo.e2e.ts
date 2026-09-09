import { test } from '@playwright/test';

/**
 * OS TETOS DO MODO SEM CONTA (`src/core/tetoAnonimo.ts`: 5 gravacoes, 80 palavras).
 *
 * NAO ALCANCAVEL NESTA SUITE, e o motivo e de build, nao de dado: `estaAnonimo()` so e verdade
 * quando `authRequired` e verdade, e `authRequired = VITE_AUTH_REQUIRED === '1' && configurado`
 * (`src/lib/supabase.ts`) — exige URL e chave anonima de um projeto Supabase compilados no
 * bundle. O `webServer` desta suite e `npm run dev:local`, que forca `VITE_AUTH_REQUIRED=0` e
 * zera as duas variaveis (`subir-dev.mjs`), entao a identidade e sempre `selfhost`: nenhuma
 * flag de localStorage ou de URL leva ao estado `anonimo`, e o servidor efemero (`data/efemero`)
 * nunca e montado. Cobrir o teto de verdade pede um segundo `webServer` com um projeto Supabase de
 * teste — fora do escopo desta fase. A regra em si esta coberta em `tests/` (vitest) pelo core.
 */
test.skip('o modo sem conta recusa a 6a gravacao e a 81a palavra com a mensagem do teto', () => {
  // exige build com VITE_AUTH_REQUIRED=1 e projeto Supabase; dev:local roda sempre como selfhost
});
