-- FLAG `pre_traducao_de_legendas` (openspec pre-traducao-de-legendas): constante `FLAG_PRE_TRADUCAO_DE_LEGENDAS` em `src/core/planos.ts`. NASCE DESLIGADA, SEM REGRA DE PLANO (`regras = '{}'`).
-- Numeração conferida contra a origin/main (última era 0031). Semente idempotente. Par SQLite: 0072.
-- REVERSÃO: `DELETE FROM flags WHERE chave = 'pre_traducao_de_legendas'` (flag ausente é desligada).
INSERT INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'pre_traducao_de_legendas',
  'Pré-tradução de legendas importadas (openspec pre-traducao-de-legendas): com a flag ligada, a legenda .srt/.vtt/.ass importada pode ser traduzida em lote NO APARELHO (Bergamot/opus-mt), em lotes canceláveis que não travam a tela, com progresso honesto e a legenda segura aplicada. Só motor local, nunca nuvem. Desligada, a importação só produz o texto das falas, como antes. Ligar é ato do dono, depois da medição em celular real.',
  false, '{}', NULL, 1794800000011, 'semente')
  ON CONFLICT (chave) DO NOTHING;
