-- FLAG `parciais_parakeet` (openspec parciais-incrementais): constante `FLAG_PARCIAIS_PARAKEET` em `src/core/planos.ts`. NASCE DESLIGADA, SEM REGRA DE PLANO (`regras = '{}'`).
-- Numeração conferida contra a main (renumerada de 0028). Semente idempotente. Par SQLite: 0070.
-- REVERSÃO: `DELETE FROM flags WHERE chave = 'parciais_parakeet'` (flag ausente é desligada).
INSERT INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'parciais_parakeet',
  'Parcial do Parakeet (openspec parciais-incrementais, V2): com a flag ligada E parciais_vivos ligada, o Parakeet passa a emitir parcial por re-decode da janela que cresce, com a mesma cadência adaptativa, só onde o Parakeet já é o motor do perfil e sem baixar modelo novo. Desligada, o Parakeet não emite parcial, como hoje. Ligar é ato do dono, depois do A/B aprovado.',
  false, '{}', NULL, 1794800000009, 'semente')
  ON CONFLICT (chave) DO NOTHING;
