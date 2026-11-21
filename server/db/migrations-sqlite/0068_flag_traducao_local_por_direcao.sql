-- FLAG `traducao_local_por_direcao` (openspec traducao-local-por-direcao, tarefa 2.1): tradução local por direção.
-- NASCE DESLIGADA, SEM REGRA DE PLANO (`regras = '{}'`). Número PROVISÓRIO conferido no laboratório
-- (reconferir contra a main no PR). Semente idempotente (`INSERT OR IGNORE`). Aditiva: só dado.
-- REVERSÃO: `DELETE FROM flags WHERE chave = 'traducao_local_por_direcao'` (flag ausente é desligada).
INSERT OR IGNORE INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'traducao_local_por_direcao',
  'Tradução local por direção (openspec traducao-local-por-direcao): com a flag ligada e VITE_BERGAMOT_MODELOS_URL definida, o tradutor local do aparelho passa a usar os pares X→en publicados do Bergamot (en→pt-BR segue no opus-mt com o alvo pt_br, até o teste cego aprovar outro). Desligada, o Bergamot atende só o pt→en embutido, como hoje, mesmo com modelos no R2. Ligar é ato do dono, depois dos portões de licença, memória e aparelho real.',
  0, '{}', NULL, 1794800000007, 'semente'
);
