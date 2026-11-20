-- FLAG `stt_aparelho_primeiro` (Fase B, item 6 do plano de qualidade da IA paga; decisão do dono de 24/10/2026):
-- no automático de quem tem nuvem, o computador com o Parakeet pronto (pt/es, cópia no aparelho) transcreve
-- primeiro, e a nuvem entra quando o áudio fica difícil (`src/core/rota/audioDificil.ts`). `FLAG_STT_APARELHO_PRIMEIRO`.
-- NASCE DESLIGADA, SEM REGRA DE PLANO (`regras = '{}'`): quem tem nuvem é o plano, não a flag. Antes de ligar no
-- staging, calibrar a detecção na bancada (`docs/specs/2026-10-24-stt-aparelho-primeiro.md`).
-- Semente idempotente (`INSERT OR IGNORE`): rodar de novo não desliga o que o operador ligou. Aditiva: só dado.
-- REVERSÃO: `DELETE FROM flags WHERE chave = 'stt_aparelho_primeiro'` (flag ausente é desligada).
INSERT OR IGNORE INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'stt_aparelho_primeiro',
  'Aparelho primeiro na transcrição (Fase B, item 6): no automático de quem tem nuvem, o computador com o Parakeet pronto transcreve e a nuvem fica para o áudio difícil. Desligada, a nuvem vai primeiro como hoje. Ligar é ato do dono, depois da calibração na bancada.',
  0, '{}', NULL, 1793000000000, 'semente'
);
