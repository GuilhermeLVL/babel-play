-- FLAG `ia_de_estudo` (planos v4, etapa 2): a explicação da frase (`POST /api/ai/explicar`) e o resumo da sessão que
-- vira cartões. `src/core/planos.ts` (`FLAG_IA_DE_ESTUDO`, `explicacoesMes`/`resumosMes`, `AMOSTRA_DE_IA`).
-- NASCE DESLIGADA, SEM REGRA DE PLANO (`regras = '{}'`): quem pode é o plano ou a amostra do Grátis, não a flag.
-- Semente idempotente (`INSERT OR IGNORE`): rodar de novo não desliga o que o operador ligou. Aditiva: só dado.
-- REVERSÃO: `DELETE FROM flags WHERE chave = 'ia_de_estudo'` (flag ausente é desligada).
INSERT OR IGNORE INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'ia_de_estudo',
  'IA de estudo (planos v4, etapa 2): explicação da frase e resumo da sessão em cartões. Desligada, as rotas respondem 404 recurso_indisponivel e as telas não mudam. Ligar é ato do dono; sai quando o recurso for de todos.',
  0, '{}', NULL, 1792900000000, 'semente'
);
