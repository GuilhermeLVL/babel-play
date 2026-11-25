-- FLAG `sombra_local` (openspec sombra-sem-web-speech): constante `FLAG_SOMBRA_LOCAL` em `src/core/planos.ts`. NASCE DESLIGADA, SEM REGRA DE PLANO (`regras = '{}'`).
-- Número 0035 PROVISÓRIO (o integrador renumera). Semente idempotente. Par SQLite: 0075.
-- REVERSÃO: `DELETE FROM flags WHERE chave = 'sombra_local'` (flag ausente é desligada).
INSERT INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'sombra_local',
  'Sombra local (openspec sombra-sem-web-speech): com a flag ligada, a prática de pronúncia (Sombra da fala) pode transcrever a frase NO APARELHO (Moonshine/Whisper, PCM 16 kHz + VAD) quando o navegador não tem Web Speech utilizável (Firefox, Quest) ou o perfil protegido não pode usá-lo. A nota é a mesma (scorePronunciation), rotulada como palpite. O áudio nunca sai do aparelho. Só inglês no começo. Desligada, a prática é a de hoje. Ligar é ato do dono: staging só no id dele, depois da rodada em Firefox e Quest.',
  false, '{}', NULL, 1794800000014, 'semente')
  ON CONFLICT (chave) DO NOTHING;
