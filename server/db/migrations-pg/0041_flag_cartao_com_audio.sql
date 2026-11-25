-- FLAG `cartao_com_audio` (openspec cartao-com-audio-do-trecho): constante `FLAG_CARTAO_COM_AUDIO` em `src/core/planos.ts`. NASCE DESLIGADA, SEM REGRA DE PLANO (`regras = '{}'`).
-- Número PROVISÓRIO 0041 (o integrador renumera). Semente idempotente. Par SQLite: 0080.
-- REVERSÃO: `DELETE FROM flags WHERE chave = 'cartao_com_audio'` (flag ausente é desligada).
INSERT INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'cartao_com_audio',
  'Flag `cartao_com_audio` (openspec cartao-com-audio-do-trecho): o cartão guarda o áudio do trecho (Ogg Opus ~24 kbps, 1 a 8 s) SÓ NESTE APARELHO (IndexedDB); nada sobe ao servidor. O verso toca o clipe do cartão antes do trecho da sessão e da voz do aparelho. Desligada, nada muda. Ligar é ato do dono, depois da escuta cega do bitrate e da medição em aparelho real.',
  false, '{}', NULL, 1795616218198, 'semente')
  ON CONFLICT (chave) DO NOTHING;
