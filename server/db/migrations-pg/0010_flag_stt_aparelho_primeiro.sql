-- FLAG `stt_aparelho_primeiro` (Fase B, item 6). Par da 0056 do SQLite: nasce DESLIGADA, sem regra de plano.
-- Semente idempotente (`ON CONFLICT DO NOTHING`): rodar de novo não desliga o que o operador ligou.
-- REVERSÃO: `DELETE FROM flags WHERE chave = 'stt_aparelho_primeiro'` (flag ausente é desligada).
INSERT INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'stt_aparelho_primeiro',
  'Aparelho primeiro na transcrição (Fase B, item 6): no automático de quem tem nuvem, o computador com o Parakeet pronto transcreve e a nuvem fica para o áudio difícil. Desligada, a nuvem vai primeiro como hoje. Ligar é ato do dono, depois da calibração na bancada.',
  false, '{}', NULL, 1793000000000, 'semente')
  ON CONFLICT (chave) DO NOTHING;
