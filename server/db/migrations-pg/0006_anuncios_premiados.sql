-- AS EXIBIÇÕES DO ANÚNCIO PREMIADO (spec `anuncios-no-gratis`, `server/routes/anuncios.ts`). Na web não há verificação
-- servidor a servidor da rede: `iniciar` cria a linha com um `exibicao_id` aleatório e `concluir` credita uma vez só
-- (grava `concluido_em` e `dia`, o dia UTC da conclusão). Os tetos do dia contam as concluídas por `dia`. Dado do
-- titular: sai na exclusão de conta (`TABELAS_DO_TITULAR`). RLS e REVOKE como em 0002/0003/0005: o PostgREST do
-- Supabase não pode enxergá-la com a chave `anon`.
-- REVERSÃO: `DROP TABLE "anuncios_premiados"` (só depois de voltar o código sem a rota `/api/anuncios`).
CREATE TABLE "anuncios_premiados" (
	"user_id" text NOT NULL,
	"exibicao_id" text NOT NULL,
	"espaco" text NOT NULL,
	"dia" text,
	"iniciado_em" bigint NOT NULL,
	"concluido_em" bigint,
	CONSTRAINT "anuncios_premiados_user_id_exibicao_id_pk" PRIMARY KEY("user_id","exibicao_id")
);
--> statement-breakpoint
CREATE INDEX "idx_anuncios_premiados_dia" ON "anuncios_premiados" USING btree ("dia");
--> statement-breakpoint
ALTER TABLE "anuncios_premiados" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE anuncios_premiados FROM anon, authenticated';
  END IF;
END $$;
