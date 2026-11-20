-- TRAVAS DE LINHA. `travarUsuario`/`travarGlobal` (server/db/db.ts) deixam o advisory lock (trava consultiva), que o
-- Hyperdrive (pool por transação) não suporta, e passam a travar uma linha desta tabela (`u:<userId>`,
-- `g:<nome>`) até o fim da transação. RLS e REVOKE como em 0002: a tabela é nova, e o PostgREST do Supabase
-- não pode enxergá-la com a chave `anon`.
-- REVERSÃO: `DROP TABLE "travas"` (só depois de voltar o código às travas consultivas).
CREATE TABLE "travas" (
	"chave" text PRIMARY KEY NOT NULL,
	"criado_em" bigint NOT NULL
);
--> statement-breakpoint
-- Cada trava tomada regrava a linha (ON CONFLICT DO UPDATE): espaço livre na página deixa a nova versão no
-- mesmo bloco (atualização HOT), o que importa na linha quente `g:` (teto global).
ALTER TABLE "travas" SET (fillfactor = 50);
--> statement-breakpoint
ALTER TABLE "travas" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE travas FROM anon, authenticated';
  END IF;
END $$;
