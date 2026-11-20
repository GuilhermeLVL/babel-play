-- SEGURANÇA NO SUPABASE. O Supabase expõe o schema `public` pelo PostgREST: com a chave `anon` (pública,
-- embutida em qualquer cliente) qualquer pessoa leria e escreveria nestas tabelas por HTTP, sem passar pelo
-- servidor. Aqui fechamos as duas portas: (1) RLS ligada em toda tabela, SEM políticas (o app conecta como dono
-- do banco, que ignora RLS; `anon` e `authenticated` ficam sem acesso nenhum); (2) REVOKE dos privilégios dos
-- papéis `anon` e `authenticated`, inclusive os padrões de objetos futuros. O bloco de REVOKE só roda quando o
-- papel `anon` existe, então PGlite e Postgres puro (testes, dev) passam sem erro.
-- REVERSÃO: `ALTER TABLE ... DISABLE ROW LEVEL SECURITY` e GRANT de volta aos papéis (não faça em produção).
ALTER TABLE "agregados_diarios" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "anki_decks" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "anki_imports" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "anki_notes" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "billing_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "boot_falhas" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "cache_de_traducao" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "convidados" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "credit_purchases" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "credit_spends" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "estado_da_conta" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "estado_dos_agregados" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "estado_por_item" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "exercise_results" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "flags" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "gasto_de_ia" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "glossario" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "idades_declaradas" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "marcas_de_teste" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "presencas" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "provider_credentials" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "rank" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "review_logs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "secrets" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "seed_credits" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "seed_spends" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "settings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "testes_premium" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "usage_counters" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "user_interests" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "utterances" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "versoes_de_dados" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "vinculos_de_responsavel" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "vocab_cards" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "vocab_occurrences" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated';
    EXECUTE 'REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated';
  END IF;
END $$;
