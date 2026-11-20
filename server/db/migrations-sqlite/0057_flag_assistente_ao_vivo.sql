-- FLAG `assistente_ao_vivo` (Fase C1 do plano da legenda flutuante; decisão do dono de 25/10/2026): o assistente ao
-- vivo de nuvem — expressões e gírias da linha, termo técnico ou sigla em uma linha, "Como respondo?" e a correção
-- gentil da própria fala (`POST /api/ai/assistente/*`, `docs/specs/2026-10-25-assistente-ao-vivo.md`).
-- `FLAG_ASSISTENTE_AO_VIVO`. NASCE DESLIGADA, SEM REGRA DE PLANO (`regras = '{}'`): quem pode é o plano
-- (`assistenteDia` em `src/core/planos.ts`; Grátis e convidado não têm). Antes de ligar: a tela (Fase C2) e a medição
-- de qualidade e latência (`docs/auditoria/eval-assistente-v1.md`).
-- Semente idempotente (`INSERT OR IGNORE`): rodar de novo não desliga o que o operador ligou. Aditiva: só dado.
-- REVERSÃO: `DELETE FROM flags WHERE chave = 'assistente_ao_vivo'` (flag ausente é desligada).
INSERT OR IGNORE INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'assistente_ao_vivo',
  'Assistente ao vivo (Fase C): expressões e gírias da legenda, termo ou sigla em uma linha, "Como respondo?" e a correção gentil da própria fala, só nos planos pagos (teto do dia assistenteDia). Desligada, as rotas respondem 404 e nada muda. Ligar é ato do dono, depois da tela e da medição.',
  0, '{}', NULL, 1793100000000, 'semente'
);
