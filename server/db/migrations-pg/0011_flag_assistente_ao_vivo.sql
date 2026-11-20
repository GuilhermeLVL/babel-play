-- FLAG `assistente_ao_vivo` (Fase C1). Par da 0057 do SQLite: nasce DESLIGADA, sem regra de plano.
-- Semente idempotente (`ON CONFLICT DO NOTHING`): rodar de novo não desliga o que o operador ligou.
-- REVERSÃO: `DELETE FROM flags WHERE chave = 'assistente_ao_vivo'` (flag ausente é desligada).
INSERT INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'assistente_ao_vivo',
  'Assistente ao vivo (Fase C): expressões e gírias da legenda, termo ou sigla em uma linha, "Como respondo?" e a correção gentil da própria fala, só nos planos pagos (teto do dia assistenteDia). Desligada, as rotas respondem 404 e nada muda. Ligar é ato do dono, depois da tela e da medição.',
  false, '{}', NULL, 1793100000000, 'semente')
  ON CONFLICT (chave) DO NOTHING;
