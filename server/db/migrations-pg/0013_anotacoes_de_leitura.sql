-- AS ANOTAÇÕES DO LEITOR (L2 da spec `docs/specs/2026-10-26-livros-e-leitura.md`, `server/routes/leitura.ts`):
-- grifos, notas e palavras salvas de um livro, no modelo W3C Web Annotation (CFI + citação ≤ 500 caracteres).
-- Dado do titular: sai na exclusão de conta e entra na exportação (`TABELAS_DO_TITULAR`). Só Postgres. RLS e
-- REVOKE como em 0002/0003/0005/0006: o PostgREST do Supabase não pode enxergá-la com a chave `anon`.
-- `sincronizado_em` é o relógio do SERVIDOR (cursor da sincronização, com `id` de desempate); `atualizado_em`
-- é o do aparelho e só decide o conflito (última escrita vence).
-- REVERSÃO: `DROP TABLE "anotacoes_de_leitura"` (só depois de voltar o código sem a rota `/api/leitura`).
CREATE TABLE "anotacoes_de_leitura" (
	"user_id" text NOT NULL,
	"id" text NOT NULL,
	"livro_id" text NOT NULL,
	"tipo" text NOT NULL,
	"cfi" text DEFAULT '' NOT NULL,
	"exact" text DEFAULT '' NOT NULL,
	"prefixo" text DEFAULT '' NOT NULL,
	"sufixo" text DEFAULT '' NOT NULL,
	"capitulo" text,
	"cor" text NOT NULL,
	"nota" text DEFAULT '' NOT NULL,
	"palavra" text,
	"criado_em" bigint NOT NULL,
	"atualizado_em" bigint NOT NULL,
	"apagado_em" bigint,
	"sincronizado_em" bigint NOT NULL,
	CONSTRAINT "anotacoes_de_leitura_user_id_id_pk" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
CREATE INDEX "idx_anotacoes_de_leitura_livro" ON "anotacoes_de_leitura" USING btree ("user_id","livro_id","sincronizado_em","id");
--> statement-breakpoint
ALTER TABLE "anotacoes_de_leitura" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE anotacoes_de_leitura FROM anon, authenticated';
  END IF;
END $$;
