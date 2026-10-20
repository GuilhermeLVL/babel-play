/**
 * `dotenv/config` no Worker: não há `.env` no isolate; o ambiente vem dos `vars`/secrets do Worker, que o
 * `nodejs_compat` (data de compatibilidade ≥ 2025-04-01) já põe em `process.env`.
 */
export {}
