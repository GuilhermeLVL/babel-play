-- AS PALAVRAS MARCADAS SEM CARTÃO (openspec `vocab-conhecidas-e-ignoradas`), só EXPAND:
--   `palavras_marcadas`: "Já sei" (`conhecida`) e "Ignorar" (`ignorada`) por pessoa, idioma base e chave
--   (`chaveDaPalavra`, recalculada pelo servidor). Desmarcar apaga a linha (sem lápide). Dado do titular
--   (`TABELAS_DO_TITULAR`): sai na exclusão de conta e entra na exportação. Sem FOREIGN KEY (nenhuma tabela a tem
--   para `users`). RLS e REVOKE como em 0002/0003/0005/0006/0012/0013: o PostgREST do Supabase não pode enxergá-la
--   com a chave `anon`.
-- REVERSÃO: `DROP TABLE "palavras_marcadas"` — só depois de voltar o código sem a rota `/api/vocab/marcadas`
-- (as marcações se perdem).
CREATE TABLE "palavras_marcadas" (
	"user_id" text NOT NULL,
	"lang" text NOT NULL,
	"chave" text NOT NULL,
	"estado" text NOT NULL,
	"atualizado_em" bigint NOT NULL,
	CONSTRAINT "palavras_marcadas_user_id_lang_chave_pk" PRIMARY KEY("user_id","lang","chave")
);
--> statement-breakpoint
ALTER TABLE "palavras_marcadas" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE palavras_marcadas FROM anon, authenticated';
  END IF;
END $$;
