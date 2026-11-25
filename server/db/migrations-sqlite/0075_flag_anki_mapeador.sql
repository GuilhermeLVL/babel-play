-- FLAG `anki_mapeador` (openspec motor-anki-mapeador): constante `FLAG_ANKI_MAPEADOR` em `src/core/planos.ts`.
-- NASCE DESLIGADA, SEM REGRA DE PLANO (`regras = '{}'`). Número PROVISÓRIO 0075 (última na origin/main: 0074); o integrador renumera.
-- Semente idempotente (`INSERT OR IGNORE`). Aditiva: só dado. Par PG: 0035.
-- REVERSÃO: `DELETE FROM flags WHERE chave = 'anki_mapeador'` (flag ausente é desligada).
INSERT OR IGNORE INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'anki_mapeador',
  'Mapeador de campos do Anki (openspec motor-anki-mapeador, versão enxuta): com a flag ligada, a leitura do .apkg (que continua no navegador) diz a confiança de cada palpite de campo e, com confiança baixa em palavra ou tradução, a pessoa confere e troca os campos ANTES do primeiro lote. O mapeamento confirmado fica só no aparelho (localStorage); nenhum dado novo no servidor. Desligada, a importação é a de hoje. Ligar é ato do dono, depois de conferir no navegador com o 4000EW.',
  0, '{}', NULL, 1794800000013, 'semente'
);
