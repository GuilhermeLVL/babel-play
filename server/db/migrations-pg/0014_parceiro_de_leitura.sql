-- O PARCEIRO DE LEITURA (L4 da spec `docs/specs/2026-10-26-livros-e-leitura.md`, `POST /api/ai/leitura/parceiro`).
-- 1) A FLAG `parceiro_de_leitura`: nasce DESLIGADA, sem regra de plano (quem pode é o plano, `parceiroDia`). Semente
--    idempotente (`ON CONFLICT DO NOTHING`): rodar de novo não desliga o que o operador ligou.
-- 2) O CACHE COMPARTILHADO das respostas sobre livros do catálogo PD (`cache_do_parceiro`): sem `user_id`, a chave é o
--    hash de tudo que foi ao prompt. RLS e REVOKE como em 0002/0003/0005/0006/0013: o PostgREST do Supabase não pode
--    enxergá-la com a chave `anon`. Só Postgres.
-- REVERSÃO: `DELETE FROM flags WHERE chave = 'parceiro_de_leitura'` e `DROP TABLE "cache_do_parceiro"` (só depois de
-- voltar o código sem a rota `/api/ai/leitura/parceiro`).
CREATE TABLE "cache_do_parceiro" (
	"chave" text PRIMARY KEY NOT NULL,
	"livro_id" text NOT NULL,
	"modo" text NOT NULL,
	"modelo" text NOT NULL,
	"versao_prompt" text NOT NULL,
	"resposta" text NOT NULL,
	"criado_em" bigint NOT NULL,
	"usado_em" bigint NOT NULL,
	"acertos" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_cache_do_parceiro_criado" ON "cache_do_parceiro" USING btree ("criado_em");
--> statement-breakpoint
CREATE INDEX "idx_cache_do_parceiro_usado" ON "cache_do_parceiro" USING btree ("usado_em");
--> statement-breakpoint
ALTER TABLE "cache_do_parceiro" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE cache_do_parceiro FROM anon, authenticated';
  END IF;
END $$;
--> statement-breakpoint
INSERT INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'parceiro_de_leitura',
  'Parceiro de leitura (L4 de Livros & Leitura): explicar o trecho, analogia, pergunta sobre o capítulo com citação, curiosidade da ficha, ideia para discutir e o que observar no capítulo, só nos planos pagos e no teste (teto do dia parceiroDia). Desligada, a rota responde 404 e nada muda. Ligar é ato do dono, depois da tela e do harness de qualidade.',
  false, '{}', NULL, 1793400000000, 'semente')
  ON CONFLICT (chave) DO NOTHING;
