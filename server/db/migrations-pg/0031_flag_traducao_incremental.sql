-- FLAG `traducao_incremental` (openspec parciais-incrementais): constante `FLAG_TRADUCAO_INCREMENTAL` em `src/core/planos.ts`. NASCE DESLIGADA, SEM REGRA DE PLANO (`regras = '{}'`).
-- Numeração conferida contra a main (renumerada de 0029). Semente idempotente. Par SQLite: 0071.
-- REVERSÃO: `DELETE FROM flags WHERE chave = 'traducao_incremental'` (flag ausente é desligada).
INSERT INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'traducao_incremental',
  'Tradução incremental do parcial (openspec parciais-incrementais, V3): com a flag ligada E parciais_vivos ligada, a tradução do parcial usa só o prefixo confirmado pelo LocalAgreement-2, com mask-k, só com motor de tradução local já carregado (nunca nuvem). A tradução final não muda. Desligada, a tradução do parcial é a de hoje. Ligar é ato do dono, depois do A/B aprovado.',
  false, '{}', NULL, 1794800000010, 'semente')
  ON CONFLICT (chave) DO NOTHING;
