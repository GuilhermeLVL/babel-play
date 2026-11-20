-- FLAG `ia_de_estudo` (planos v4, etapa 2). Par da 0055 do SQLite: nasce DESLIGADA, sem regra de plano.
-- Semente idempotente (`ON CONFLICT DO NOTHING`): rodar de novo não desliga o que o operador ligou.
-- REVERSÃO: `DELETE FROM flags WHERE chave = 'ia_de_estudo'` (flag ausente é desligada).
INSERT INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'ia_de_estudo',
  'IA de estudo (planos v4, etapa 2): explicação da frase e resumo da sessão em cartões. Desligada, as rotas respondem 404 recurso_indisponivel e as telas não mudam. Ligar é ato do dono; sai quando o recurso for de todos.',
  false, '{}', NULL, 1792900000000, 'semente')
  ON CONFLICT (chave) DO NOTHING;
