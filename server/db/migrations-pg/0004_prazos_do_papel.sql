-- PRAZOS DE SESSÃO NO PAPEL DO BANCO. O `options: -c statement_timeout=…` do pg.Pool (server/db/configDoPool.ts) é
-- ignorado pelo pooler do Supabase (Supavisor, 5432 e 6543) e será pelo Hyperdrive (pool por transação). O papel
-- vale para toda sessão, venha por onde vier. Valores = padrões do pool (PRAZOS_PADRAO_MS; tests/configDoPool.test.ts
-- confere). Idempotente. Sem privilégio (papel que não pode alterar a si mesmo), avisa e segue: defina à mão
-- (docs/runbook.md). Vale a partir da PRÓXIMA sessão de cada papel.
-- REVERSÃO: ALTER ROLE <papel> RESET statement_timeout; … RESET lock_timeout; … RESET idle_in_transaction_session_timeout;
DO $$ BEGIN
  EXECUTE format('ALTER ROLE %I SET statement_timeout = ''30s''', current_user);
  EXECUTE format('ALTER ROLE %I SET lock_timeout = ''10s''', current_user);
  EXECUTE format('ALTER ROLE %I SET idle_in_transaction_session_timeout = ''60s''', current_user);
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'sem privilégio: defina os prazos no papel manualmente (docs/runbook.md)';
END $$;
