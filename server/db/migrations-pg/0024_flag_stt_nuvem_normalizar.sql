-- FLAG `stt_nuvem_normalizar` (openspec stt-ingles-volume-e-rota, tarefa 3.1): normalização de volume do áudio enviado ao STT de nuvem.
-- Constante `FLAG_STT_NUVEM_NORMALIZAR` em `src/core/planos.ts`. NASCE DESLIGADA, SEM REGRA DE PLANO (`regras = '{}'`).
-- Semente idempotente (`ON CONFLICT DO NOTHING`): rodar de novo não desliga o que o operador ligou. Par SQLite: 0066.
-- REVERSÃO: `DELETE FROM flags WHERE chave = 'stt_nuvem_normalizar'` (flag ausente é desligada).
INSERT INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'stt_nuvem_normalizar',
  'Normalização de volume do áudio enviado ao STT de nuvem (openspec stt-ingles-volume-e-rota): com a flag ligada, o cliente leva o pico (percentil 99,9) de cada trecho a −3 dBFS, com ganho de até 40 dB, antes do encode e do envio; o caminho local não muda. Desligada, o corpo enviado é o de antes. Remover quando 100% estável e a medição em docs/auditoria estiver registrada. Ligar é ato do dono.',
  false, '{}', NULL, 1794800000004, 'semente')
  ON CONFLICT (chave) DO NOTHING;
