-- FLAG `parciais_vivos` (openspec parciais-incrementais): constante `FLAG_PARCIAIS_VIVOS` em `src/core/planos.ts`. NASCE DESLIGADA, SEM REGRA DE PLANO (`regras = '{}'`).
-- Numeração conferida contra a main (renumerada de 0027). Semente idempotente. Par SQLite: 0069.
-- REVERSÃO: `DELETE FROM flags WHERE chave = 'parciais_vivos'` (flag ausente é desligada).
INSERT INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'parciais_vivos',
  'Parciais vivos (openspec parciais-incrementais, V1): com a flag ligada, o parcial do Whisper/Moonshine local usa o onUpdate, a cadência do parcial passa a ser adaptativa (RTF medido e ocupação do worker, piso 500 ms, teto 2 s) e o texto confirmado por LocalAgreement-2 nunca regride, com a cauda não confirmada em estilo provisório. O final segue com prioridade e cancela o parcial. Desligada, o parcial é o de hoje (tique de 2 s, no máximo 3 por fala). Só local: parcial nunca vai à nuvem. Ligar é ato do dono, depois do A/B aprovado.',
  false, '{}', NULL, 1794800000008, 'semente')
  ON CONFLICT (chave) DO NOTHING;
