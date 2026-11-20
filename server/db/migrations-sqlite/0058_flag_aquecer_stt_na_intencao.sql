-- FLAG `aquecer_stt_na_intencao` (openspec aquecer-stt-na-intencao): aquece o STT local quando a pessoa dá sinal de
-- que vai capturar (200 ms em "Iniciar" ou idiomas confirmados). `FLAG_AQUECER_STT_NA_INTENCAO`.
-- NASCE DESLIGADA, SEM REGRA DE PLANO (`regras = '{}'`). Ligar é ato do dono, depois de medir Safari e 6 GB.
-- Semente idempotente (`INSERT OR IGNORE`): rodar de novo não desliga o que o operador ligou. Aditiva: só dado.
-- REVERSÃO: `DELETE FROM flags WHERE chave = 'aquecer_stt_na_intencao'` (flag ausente é desligada).
INSERT OR IGNORE INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'aquecer_stt_na_intencao',
  'Aquecer o STT na intenção: com ela ligada, o foco ou o ponteiro por 200 ms em Iniciar, ou a confirmação dos idiomas, carrega do cache o modelo de fala do aparelho antes do clique. Desligada, só o previsto do selo ao abrir, como hoje. Ligar é ato do dono, depois de medir Safari e aparelho de 6 GB.',
  0, '{}', NULL, 1793200000000, 'semente'
);
