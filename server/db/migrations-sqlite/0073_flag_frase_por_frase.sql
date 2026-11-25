-- FLAG `frase_por_frase` (openspec repetir-e-pausar-por-frase): constante `FLAG_FRASE_POR_FRASE` em `src/core/planos.ts`.
-- NASCE DESLIGADA, SEM REGRA DE PLANO (`regras = '{}'`). Número PROVISÓRIO 0073 (última na origin/main: 0072); o integrador pode renumerar.
-- Semente idempotente (`INSERT OR IGNORE`). Aditiva: só dado. Par PG: 0033.
-- REVERSÃO: `DELETE FROM flags WHERE chave = 'frase_por_frase'` (flag ausente é desligada).
INSERT OR IGNORE INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'frase_por_frase',
  'Repetir e pausar por frase (openspec repetir-e-pausar-por-frase): com a flag ligada, o player da sessão oferece o modo Frase por frase (repetir 1x a 3x, pausa para a pessoa repetir em voz alta, parar no fim) sobre o áudio da sessão, a narração por voz e o audiolivro. Só mídia do próprio Frasy; nada é gravado nem sai do aparelho. Desligada, o player é o de hoje. Ligar é ato do dono, depois de 20 frases em aparelho real.',
  0, '{}', NULL, 1794800000012, 'semente'
);
