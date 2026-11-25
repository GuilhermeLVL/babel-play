-- FLAG `leitura_voz_local` (openspec leitura-ativa-com-moonshine): constante `FLAG_LEITURA_VOZ_LOCAL` em `src/core/planos.ts`.
-- NASCE DESLIGADA, SEM REGRA DE PLANO (`regras = '{}'`). Número 0079 PROVISÓRIO (o integrador renumera).
-- Semente idempotente (`INSERT OR IGNORE`). Aditiva: só dado. Par PG: 0040.
-- REVERSÃO: `DELETE FROM flags WHERE chave = 'leitura_voz_local'` (flag ausente é desligada).
INSERT OR IGNORE INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'leitura_voz_local',
  'Leitura ativa com voz local (openspec leitura-ativa-com-moonshine): com a flag ligada (e a leitura_ativa), "Ler em voz alta" funciona também sem Web Speech local (Firefox, Safari, Quest), ouvindo a leitura em inglês com o Moonshine NO APARELHO (PCM 16 kHz + VAD, modelo baixado com consentimento). O áudio nunca sai do aparelho e morre a cada frase. Desligada, a tela é a de hoje. Ligar é ato do dono: staging só no id dele, depois da avaliação com 10 a 20 brasileiros e da rodada em aparelho real.',
  0, '{}', NULL, 1794800000020, 'semente'
);
