-- FLAG `roteador_adaptativo_sombra` (openspec roteador-adaptativo-em-sombra, tarefa 3.1): roteador adaptativo SÓ EM SOMBRA.
-- Constante `FLAG_ROTEADOR_ADAPTATIVO_SOMBRA` em `src/core/planos.ts`. NASCE DESLIGADA, SEM REGRA DE PLANO (`regras = '{}'`).
-- Número conferido no laboratório (reconferir contra a main no PR). Semente idempotente. Par SQLite: 0067.
-- REVERSÃO: `DELETE FROM flags WHERE chave = 'roteador_adaptativo_sombra'` (flag ausente é desligada).
INSERT INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'roteador_adaptativo_sombra',
  'Roteador adaptativo em sombra (openspec roteador-adaptativo-em-sombra): com a flag ligada, o app calcula por fala o que um roteador por RTF, fila e confiança do STT decidiria e registra só contagens agregadas ao lado da rota real; NUNCA muda a rota, o motor, o modelo, a nuvem nem o tradutor. Desligada, nada é calculado nem registrado. Ligar depende do critério E-005 e é ato do dono.',
  false, '{}', NULL, 1794800000007, 'semente')
  ON CONFLICT (chave) DO NOTHING;
