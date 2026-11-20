-- CACHE DE TRADUÇÃO PERSISTENTE — o nível 2 (L2) de `server/ai/cacheDeTraducao.ts` (auditoria de
-- eficiência da IA, 28/09, relatório §6 fase 1 item 2). O L1 em memória some a cada deploy; este
-- guarda por 30 dias a frase CURTA que se repete, para não pagar o provedor duas vezes por ela.
--
-- NÃO É DADO DO TITULAR: não há `user_id`, IP nem nada que diga quem pediu, e a frase de origem não
-- é guardada (só o hash, na `chave`). Só entra frase de até 12 palavras (fala: até 4) sem cara de
-- dado pessoal — LGPD art. 12/14, o público inclui menores. Por isso fica FORA de
-- `TABELAS_DO_TITULAR`: uma linha é de todos que dizem a mesma frase curta, e de ninguém.
-- Poda diária: vencidas (30 dias desde `criado_em`) e, acima do teto, as menos usadas (`usado_em`).
--
-- Aditiva (expand) e reaplicável (IF NOT EXISTS): nenhum código anterior a lê.
-- REVERSAO: `DROP TABLE cache_de_traducao` — sem ela o L2 falha em silêncio (vira falta) e o
-- servidor segue só com o cache em memória, o comportamento anterior.
CREATE TABLE IF NOT EXISTS cache_de_traducao (
  chave TEXT PRIMARY KEY NOT NULL,
  origem TEXT NOT NULL,
  destino TEXT NOT NULL,
  modelo TEXT NOT NULL,
  versao_prompt TEXT NOT NULL,
  traducao TEXT NOT NULL,
  criado_em INTEGER NOT NULL,
  usado_em INTEGER NOT NULL,
  acertos INTEGER DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_cache_de_traducao_criado ON cache_de_traducao (criado_em);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_cache_de_traducao_usado ON cache_de_traducao (usado_em);
