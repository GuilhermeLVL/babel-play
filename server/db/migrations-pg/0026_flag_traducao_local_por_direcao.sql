-- FLAG `traducao_local_por_direcao` (openspec traducao-local-por-direcao, tarefa 2.1): tradução local por direção.
-- Constante `FLAG_TRADUCAO_LOCAL_POR_DIRECAO` em `src/core/planos.ts`. NASCE DESLIGADA, SEM REGRA DE PLANO (`regras = '{}'`).
-- Número PROVISÓRIO, conferido no laboratório (reconferir contra a main no PR). Semente idempotente. Par SQLite: 0068.
-- REVERSÃO: `DELETE FROM flags WHERE chave = 'traducao_local_por_direcao'` (flag ausente é desligada).
INSERT INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'traducao_local_por_direcao',
  'Tradução local por direção (openspec traducao-local-por-direcao): com a flag ligada e VITE_BERGAMOT_MODELOS_URL definida, o tradutor local do aparelho passa a usar os pares X→en publicados do Bergamot (en→pt-BR segue no opus-mt com o alvo pt_br, até o teste cego aprovar outro). Desligada, o Bergamot atende só o pt→en embutido, como hoje, mesmo com modelos no R2. Ligar é ato do dono, depois dos portões de licença, memória e aparelho real.',
  false, '{}', NULL, 1794800000007, 'semente')
  ON CONFLICT (chave) DO NOTHING;
