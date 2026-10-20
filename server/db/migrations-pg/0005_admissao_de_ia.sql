-- ADMISSÃO DE IA NO BANCO. Os baldes por provedor e modelo (minuto e dia, pedidos e tokens), o bloqueio do 429 do
-- provedor e as vagas em voo por usuário saem da memória do processo (`server/ai/admissao.ts`): num Worker cada
-- isolate teria a própria cópia e a soma passaria do limite da conta. Reserva atômica numa instrução
-- (`server/db/repositories/admissaoDeIa.ts`). RLS e REVOKE como em 0002/0003: o PostgREST do Supabase não pode
-- enxergá-la com a chave `anon`.
-- REVERSÃO: `DROP TABLE "admissao_de_ia"` (só depois de voltar o código à admissão em memória).
CREATE TABLE "admissao_de_ia" (
	"chave" text NOT NULL,
	"janela" text NOT NULL,
	"usado" double precision DEFAULT 0 NOT NULL,
	"em_voo" bigint DEFAULT 0 NOT NULL,
	"bloqueado_ate" bigint DEFAULT 0 NOT NULL,
	"atualizado_em" bigint NOT NULL,
	CONSTRAINT "admissao_de_ia_chave_janela_pk" PRIMARY KEY("chave","janela")
);
--> statement-breakpoint
-- Cada reserva regrava a linha da janela (ON CONFLICT DO UPDATE): espaço livre na página deixa a nova versão no
-- mesmo bloco (atualização HOT), como em `travas` — o minuto corrente de um modelo é linha quente.
ALTER TABLE "admissao_de_ia" SET (fillfactor = 50);
--> statement-breakpoint
ALTER TABLE "admissao_de_ia" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE admissao_de_ia FROM anon, authenticated';
  END IF;
END $$;
