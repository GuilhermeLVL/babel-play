-- PRAZOS DE SESSÃO NO PAPEL DO BANCO. O `options: -c statement_timeout=…` do pg.Pool (server/db/configDoPool.ts) é
-- ignorado pelo pooler do Supabase (Supavisor, 5432 e 6543) e será pelo Hyperdrive (pool por transação). O papel
-- vale para toda sessão, venha por onde vier. Valores = padrões do pool (PRAZOS_PADRAO_MS; tests/configDoPool.test.ts
-- confere). Idempotente. Sem privilégio (papel que não pode alterar a si mesmo), avisa e segue: defina à mão
-- (docs/runbook.md). Vale a partir da PRÓXIMA sessão de cada papel.
-- REVERSÃO: ALTER ROLE <papel> RESET statement_timeout; … RESET lock_timeout; … RESET idle_in_transaction_session_timeout;
-- CONCORRÊNCIA: o papel é do CLUSTER, não do banco. Dois bancos do mesmo cluster migrando ao mesmo tempo (os testes
-- com um banco por arquivo, `--maxWorkers=2`) fazem `ALTER ROLE` do mesmo papel juntos, e o segundo cai em
-- `XX000 tuple concurrently updated` (ou `23505` se o papel ainda não tinha nenhuma). Trava consultiva não serve (é por banco). Então: se o papel já tem os três
-- valores, nada a fazer; senão, até 10 tentativas com espera crescente, e só esse erro é repetido.
DO $$
DECLARE
  esperado text[] := ARRAY['statement_timeout=30s', 'lock_timeout=10s', 'idle_in_transaction_session_timeout=60s'];
BEGIN
  IF EXISTS (SELECT 1 FROM pg_db_role_setting s JOIN pg_roles r ON r.oid = s.setrole
             WHERE r.rolname = current_user AND s.setdatabase = 0 AND s.setconfig @> esperado) THEN
    RETURN;
  END IF;
  FOR i IN 1..10 LOOP
    BEGIN
      EXECUTE format('ALTER ROLE %I SET statement_timeout = ''30s''', current_user);
      EXECUTE format('ALTER ROLE %I SET lock_timeout = ''10s''', current_user);
      EXECUTE format('ALTER ROLE %I SET idle_in_transaction_session_timeout = ''60s''', current_user);
      EXIT;
    EXCEPTION
      -- Duas formas da MESMA corrida: `XX000 tuple concurrently updated` quando o papel já tinha
      -- configuração e os dois atualizam a linha; `23505` (unique_violation em pg_db_role_setting)
      -- quando o papel NÃO tinha nenhuma e os dois inserem a primeira — o caso de um cluster
      -- recém-criado (CI, Docker de teste). Ambas se resolvem repetindo.
      WHEN SQLSTATE 'XX000' OR unique_violation THEN
        IF (SQLERRM LIKE '%tuple concurrently updated%' OR SQLSTATE = '23505') AND i < 10 THEN
          PERFORM pg_sleep(0.05 * i);
        ELSE
          RAISE;
        END IF;
    END;
  END LOOP;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'sem privilégio: defina os prazos no papel manualmente (docs/runbook.md)';
END $$;
