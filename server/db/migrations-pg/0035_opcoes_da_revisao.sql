-- AS OPÇÕES DA REVISÃO NA CONTA (openspec `cartoes`, tarefas 2.1 e 2.2), só EXPAND:
--   `opcoes_da_revisao`: uma linha por pessoa com os limites diários (novas e revisões), a ordem, o tipo de
--   cartão, a voz ao mostrar, a meta de retenção e os botões de nota. Sem linha = opções padrão (o código lê assim,
--   então o código antigo, que não conhece a tabela, segue valendo). O contador do dia não mora aqui: vem de
--   `agregados_diarios`. Dado do titular (`TABELAS_DO_TITULAR`): sai na exportação e na exclusão de conta. Sem
--   FOREIGN KEY (nenhuma tabela a tem para `users`). RLS e REVOKE como em 0027: o PostgREST do Supabase não pode
--   enxergá-la com a chave `anon`.
-- NÚMERO PROVISÓRIO (0035): o integrador renumera se outra frente tomar o 0035. Par SQLite: nenhum (tabela só do
--   Postgres, como `palavras_marcadas`).
-- REVERSÃO: `DROP TABLE "opcoes_da_revisao"` — só depois de voltar o código sem a rota
--   `/api/vocab/opcoes-da-revisao` (as opções gravadas na conta se perdem; o navegador ainda tem a cópia local).
-- APLICAÇÃO EM PRODUÇÃO [D]: backup antes (pg_dump) e ensaio na cópia do banco; ver `openspec/changes/cartoes/tasks.md`.
CREATE TABLE "opcoes_da_revisao" (
	"user_id" text PRIMARY KEY NOT NULL,
	"novas" bigint NOT NULL,
	"revisoes" bigint NOT NULL,
	"ordem" text NOT NULL,
	"tipo" text NOT NULL,
	"ouvir" boolean NOT NULL,
	"retencao" bigint NOT NULL,
	"botoes" bigint NOT NULL,
	"atualizado_em" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "opcoes_da_revisao" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE opcoes_da_revisao FROM anon, authenticated';
  END IF;
END $$;
