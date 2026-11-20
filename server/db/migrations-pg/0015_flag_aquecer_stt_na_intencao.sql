-- FLAG `aquecer_stt_na_intencao` (openspec aquecer-stt-na-intencao). Par da 0058 do SQLite: nasce DESLIGADA, sem regra de plano.
-- Semente idempotente (`ON CONFLICT DO NOTHING`): rodar de novo não desliga o que o operador ligou.
-- REVERSÃO: `DELETE FROM flags WHERE chave = 'aquecer_stt_na_intencao'` (flag ausente é desligada).
INSERT INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'aquecer_stt_na_intencao',
  'Aquecer o STT na intenção: com ela ligada, o foco ou o ponteiro por 200 ms em Iniciar, ou a confirmação dos idiomas, carrega do cache o modelo de fala do aparelho antes do clique. Desligada, só o previsto do selo ao abrir, como hoje. Ligar é ato do dono, depois de medir Safari e aparelho de 6 GB.',
  false, '{}', NULL, 1793500000000, 'semente')
  ON CONFLICT (chave) DO NOTHING;
