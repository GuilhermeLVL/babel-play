-- ETIQUETAS DE PALAVRAS (lado do servidor), só EXPAND:
--   - `palavras_vistas`: o índice derivado das falas — por sessão, quantas vezes cada palavra (chave sem acento
--     e sem caixa, idioma base) apareceu, com o `idx` de uma fala de exemplo. Mantido no mesmo lote de toda
--     escrita em `utterances` (`palavrasVistasRepo`); o legado entra por `operacao.cjs palavras reindexar`.
--     FK para `sessions` com ON DELETE CASCADE (dado derivado: sai com a sessão na limpeza diária e na exclusão
--     de conta); a remoção soft da sessão apaga as linhas no mesmo lote. Dado do titular (`TABELAS_DO_TITULAR`).
--     RLS e REVOKE como em 0002/0003/0005/0006: o PostgREST do Supabase não pode enxergá-la com a chave `anon`.
--   - `vocab_cards.nota`: a nota pessoal da palavra (até 500 caracteres, `PUT /api/vocab/:id/nota`). Nula = sem nota.
-- REVERSÃO: `DROP TABLE "palavras_vistas"` e `ALTER TABLE "vocab_cards" DROP COLUMN "nota"` — só depois de voltar o
-- código sem as rotas `/api/vocab/vistas`, `/api/vocab/palavra` e `/api/vocab/:id/nota` (a nota escrita se perde).
CREATE TABLE "palavras_vistas" (
	"user_id" text NOT NULL,
	"session_id" text NOT NULL,
	"lang" text NOT NULL,
	"chave" text NOT NULL,
	"vezes" bigint DEFAULT 0 NOT NULL,
	"primeira_em" bigint NOT NULL,
	"ultima_em" bigint NOT NULL,
	"exemplo_idx" bigint,
	CONSTRAINT "palavras_vistas_user_id_session_id_lang_chave_pk" PRIMARY KEY("user_id","session_id","lang","chave")
);
--> statement-breakpoint
ALTER TABLE "vocab_cards" ADD COLUMN "nota" text;--> statement-breakpoint
ALTER TABLE "palavras_vistas" ADD CONSTRAINT "palavras_vistas_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_palavras_vistas_chave" ON "palavras_vistas" USING btree ("user_id","lang","chave");--> statement-breakpoint
CREATE INDEX "idx_palavras_vistas_sessao" ON "palavras_vistas" USING btree ("session_id");
--> statement-breakpoint
ALTER TABLE "palavras_vistas" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE palavras_vistas FROM anon, authenticated';
  END IF;
END $$;
