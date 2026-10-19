-- O GLOSSÁRIO PESSOAL DA TRADUÇÃO NUANCE (D3 da Fase D) — `server/ai/glossario.ts`, `server/db/repositories/glossario.ts`.
--
-- "Sempre traduzir assim": a pessoa fixa a tradução de uma palavra salva ou de uma frase, e o servidor
-- injeta no prompt as entradas que aparecem no texto (no máximo 12 por pedido, como DADO delimitado, à
-- prova de injeção de prompt). Até 500 entradas por pessoa, cobrado no INSERT.
--
-- É DADO DO TITULAR: `user_id` entra em `TABELAS_DO_TITULAR` (exportação e exclusão, LGPD art. 18). O
-- resultado de uma tradução com glossário nunca vai para o `cache_de_traducao`, que é compartilhado.
-- O UNIQUE (dono, idiomas, termo normalizado) é o upsert — e o índice que a leitura por dono usa.
--
-- Aditiva (expand) e reaplicável (IF NOT EXISTS): nenhum código anterior a lê. Número PROVISÓRIO (as
-- 0040+ do plano; a 0041 é da Fase C) — no merge, o `when` do journal tem de ficar DEPOIS do da 0041.
-- REVERSAO: `DROP TABLE glossario` — sem ela a rota do glossário responde erro e a tradução segue sem
-- glossário (a leitura falha em silêncio, `glossarioDoPedido`), o comportamento anterior.
CREATE TABLE IF NOT EXISTS glossario (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  origem TEXT NOT NULL,
  destino TEXT NOT NULL,
  termo TEXT NOT NULL,
  termo_norm TEXT NOT NULL,
  traducao TEXT NOT NULL,
  criado_em INTEGER NOT NULL,
  atualizado_em INTEGER NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS uq_glossario_termo ON glossario (user_id, origem, destino, termo_norm);
