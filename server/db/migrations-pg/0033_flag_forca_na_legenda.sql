-- FLAG `forca_na_legenda` (openspec status-da-palavra-na-legenda): constante `FLAG_FORCA_NA_LEGENDA` em `src/core/planos.ts`. NASCE DESLIGADA, SEM REGRA DE PLANO (`regras = '{}'`).
-- Numeração PROVISÓRIA conferida contra a origin/main (última era 0032); o integrador pode renumerar. Semente idempotente. Par SQLite: 0073.
-- REVERSÃO: `DELETE FROM flags WHERE chave = 'forca_na_legenda'` (flag ausente é desligada).
INSERT INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'forca_na_legenda',
  'Força 1 a 4 na legenda e no leitor (openspec status-da-palavra-na-legenda): com a flag ligada, a etiqueta da palavra na legenda, na janela flutuante, na folha da frase e no leitor sai da força do cartão (1 = salva, 2 e 3 = aprendendo, 4 = silenciosa), sem depender do relógio, e a glosa do leitor some na força 3. Nada novo é gravado. Desligada, as etiquetas são as de hoje. Ligar é ato do dono, depois de simular o mapa no deck dele.',
  false, '{}', NULL, 1794800000012, 'semente')
  ON CONFLICT (chave) DO NOTHING;
