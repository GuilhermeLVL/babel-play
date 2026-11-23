-- FLAG `parciais_parakeet` (openspec parciais-incrementais): constante `FLAG_PARCIAIS_PARAKEET` em `src/core/planos.ts`.
-- NASCE DESLIGADA, SEM REGRA DE PLANO (`regras = '{}'`). Número PROVISÓRIO (reconferir contra a main no PR).
-- Semente idempotente (`INSERT OR IGNORE`). Aditiva: só dado. Par PG: 0028.
-- REVERSÃO: `DELETE FROM flags WHERE chave = 'parciais_parakeet'` (flag ausente é desligada).
INSERT OR IGNORE INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'parciais_parakeet',
  'Parcial do Parakeet (openspec parciais-incrementais, V2): com a flag ligada E parciais_vivos ligada, o Parakeet passa a emitir parcial por re-decode da janela que cresce, com a mesma cadência adaptativa, só onde o Parakeet já é o motor do perfil e sem baixar modelo novo. Desligada, o Parakeet não emite parcial, como hoje. Ligar é ato do dono, depois do A/B aprovado.',
  0, '{}', NULL, 1794800000009, 'semente'
);
