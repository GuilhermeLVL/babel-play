-- MENORES COM SEGURANCA (Fase 4 do plano de lancamento, ECA Digital - Lei 15.211/2025 - e LGPD art. 14).
--
-- O app abre para todos, inclusive menores. Duas coisas passam a existir no servidor:
--
-- 1) A DATA DE NASCIMENTO declarada (`idades_declaradas.nascimento`, `AAAA-MM-DD`), uma linha por
--    conta. Sem ela o servidor nao sabe a faixa (<12, 12-15, 16-17, 18+) e nao consegue aplicar o
--    perfil protegido, exigir o vinculo com o responsavel nem recusar a compra de um menor. Conta sem
--    linha = "ainda nao perguntamos" (as contas anteriores respondem na proxima entrada), nunca
--    "adulto". A declaracao e imutavel pelo proprio titular (corrigir e pelo suporte), senao um menor
--    viraria adulto trocando a data: o indice unico por `user_id` + INSERT ... DO NOTHING e a trava.
--
-- 2) O VINCULO COM O RESPONSAVEL (`vinculos_de_responsavel`). Abaixo de 16 anos a conta fica
--    vinculada a um responsavel (ECA Digital art. 24); abaixo de 12, com consentimento ESPECIFICO
--    registrado (LGPD art. 14 par. 1o): quem (`responsavel_user_id`, `nome_do_responsavel`), quando
--    (`consentimento_em`) e o TEXTO que foi aceito (`consentimento_texto` + `consentimento_versao`).
--    O convite e um token de uso unico: guardamos so o HASH (`token_hash`), com expiracao
--    (`expira_em`) e marca de uso (`usado_em`) — o UPDATE ... WHERE usado_em IS NULL e a trava.
--
-- TABELAS NOVAS, e nao colunas em `users`, de proposito: SQLite nao tem `ADD COLUMN IF NOT EXISTS`,
-- e o diario de migrations tem de poder reaplicar a ULTIMA sem quebrar o boot
-- (`tests/integration/migracoes-sobre-estado-atual.test.ts`). Tudo aqui e IF NOT EXISTS.
--
-- `user_id` e o TITULAR (em `vinculos_de_responsavel`, o menor): as duas entram em
-- TABELAS_DO_TITULAR e saem com a exclusao da conta.
--
-- REVERSAO: `DROP TABLE vinculos_de_responsavel; DROP TABLE idades_declaradas;`
CREATE TABLE IF NOT EXISTS idades_declaradas (
  id TEXT PRIMARY KEY NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  user_id TEXT,
  deleted_at INTEGER,
  nascimento TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS uq_idade_user ON idades_declaradas (user_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS vinculos_de_responsavel (
  id TEXT PRIMARY KEY NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  user_id TEXT,
  deleted_at INTEGER,
  email_do_responsavel TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expira_em INTEGER NOT NULL,
  usado_em INTEGER,
  responsavel_user_id TEXT,
  nome_do_responsavel TEXT,
  consentimento_versao TEXT,
  consentimento_texto TEXT,
  consentimento_em INTEGER,
  revogado_em INTEGER
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS uq_vinculo_token ON vinculos_de_responsavel (token_hash);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_vinculo_menor ON vinculos_de_responsavel (user_id, usado_em);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_vinculo_responsavel ON vinculos_de_responsavel (responsavel_user_id);
