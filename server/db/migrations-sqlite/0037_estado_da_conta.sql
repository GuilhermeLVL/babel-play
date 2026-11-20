-- O ESTADO DA CONTA QUE SÓ O SERVIDOR ESCREVE (revisão de 27/09 das recompensas v2).
--
-- `fuso` / `fuso_desde`: o fuso IANA gravado no primeiro uso e trocado no máximo uma vez a cada 24 h
-- (`decidirFuso`, `src/core/learning/economia.ts`). Até aqui o fuso vinha em cada pedido, e trocá-lo
-- a cada chamada inventava um "dia novo" — baús, meta do dia e missões.
-- `aviso_reembolso_em`: o aviso do corte do catálogo é entregue uma vez por CONTA (era por navegador).
--
-- Uma linha por usuário (`user_id` é a chave): dado do titular, em `TABELAS_DO_TITULAR`.
-- Aditiva (expand) e reaplicável (IF NOT EXISTS): nenhum código anterior a lê.
-- REVERSAO: `DROP TABLE estado_da_conta` — sem ela vale o fuso de cada pedido (o comportamento
-- anterior) e o aviso do reembolso volta a depender do navegador.
CREATE TABLE IF NOT EXISTS estado_da_conta (
  user_id TEXT PRIMARY KEY NOT NULL,
  fuso TEXT,
  fuso_desde INTEGER,
  aviso_reembolso_em INTEGER,
  atualizado_em INTEGER NOT NULL
);
