-- GASTO DE IA DO MÊS — o orçamento global da nuvem (Fase 2 do lançamento, OWASP LLM10).
--
-- As cotas por usuário (`usage_counters`) limitam UM assinante; nada limitava a SOMA. Esta tabela
-- guarda o gasto ESTIMADO do mês inteiro com a chave do dono (tokens e segundos x preço por modelo,
-- `server/lib/orcamentoDeIa.ts`), e é contra ela que `AI_BUDGET_USD_MONTH` é conferido antes de
-- cada chamada de nuvem.
--
-- UMA LINHA POR MÊS ('YYYY-MM'), sem `user_id`: é conta do serviço, não dado de titular — fica fora
-- de `TABELAS_DO_TITULAR` pelo mesmo motivo do `rank`.
--
-- MICRODÓLARES INTEIROS, e não REAL: a soma de milhares de custos de US$ 0,0001 em ponto flutuante
-- acumula erro, e o gatilho de 100% é uma comparação exata. US$ 1 = 1.000.000.
--
-- `alerta_80_em` / `esgotado_em` marcam QUANDO cada limiar foi cruzado. Servem para o alerta sair
-- UMA vez por mês (o UPDATE só afeta a linha se a marca estiver vazia), não a cada chamada.
--
-- REVERSÃO: `DROP TABLE gasto_de_ia`. Nada depende dela além do orçamento.
CREATE TABLE IF NOT EXISTS gasto_de_ia (
  mes TEXT PRIMARY KEY NOT NULL,
  micro_usd INTEGER NOT NULL DEFAULT 0,
  chamadas INTEGER NOT NULL DEFAULT 0,
  alerta_80_em INTEGER,
  esgotado_em INTEGER,
  atualizado_em INTEGER NOT NULL
);
