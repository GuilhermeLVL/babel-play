-- RANKING GLOBAL NO SERVIDOR (edicao leve encerrada, 2026-09-07).
--
-- O placar publico dos minijogos vivia numa Pages Function do Cloudflare contra um banco D1
-- separado (`functions/api/rank/[[path]].ts`, `functions/schema-rank.sql`). Era a UNICA
-- funcionalidade que so existia na versao hospedada no Pages — e essa versao nunca foi publicada:
-- o workflow de deploy nasceu desarmado, sem os dois secrets, e nunca foi disparado.
--
-- Ou seja: a tela de "Recordes e ranking" mostra, desde sempre, "o ranking global vive na versao
-- publicada". Encerrar a edicao leve sem trazer o ranking transformaria essa frase numa mentira —
-- ela apontaria para uma versao que nunca vai existir. Entao ele vem para ca.
--
-- SEM `user_id`, SEM `deleted_at`, SEM `updated_at`. Nao e esquecimento nem preguica: esta tabela
-- nao tem dono. O placar e publico e anonimo por desenho (apelido escolhido + pontos + combo), e
-- por isso ela fica FORA de `TABELAS_DO_TITULAR` — nao ha titular a quem uma linha pertenca, e a
-- conferencia de cobertura da exclusao de conta so cobra tabelas com `user_id`.
--
-- `ip_hash` E NAO `ip`. A versao D1 guardava o endereco em claro para a trava de um envio por
-- minuto. Um identificador de rede guardado sem prazo e sem caminho de exclusao e dado pessoal
-- atras de uma tabela que se apresenta como anonima. O hash serve a mesma trava (dois envios do
-- mesmo lugar em 60 segundos) sem guardar de quem eles sao.
--
-- REVERSAO: `DROP TABLE rank`. Nenhum dado migra do D1 porque o D1 nunca recebeu dado — o banco
-- foi criado e a Function nunca foi publicada.
CREATE TABLE IF NOT EXISTS rank (
  id TEXT PRIMARY KEY NOT NULL,
  criado_em INTEGER NOT NULL,
  jogo TEXT NOT NULL,
  apelido TEXT NOT NULL,
  pontos INTEGER NOT NULL,
  combo INTEGER NOT NULL DEFAULT 0,
  ip_hash TEXT
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_rank_jogo_pontos ON rank (jogo, pontos);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS uq_rank_jogo_apelido ON rank (jogo, apelido);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_rank_ip ON rank (ip_hash, criado_em);
