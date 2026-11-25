-- FLAG `latencia_publicada` (openspec latencia-publicada-por-aparelho): constante `FLAG_LATENCIA_PUBLICADA` em `src/core/planos.ts`. NASCE DESLIGADA, SEM REGRA DE PLANO (`regras = '{}'`).
-- Número 0038. Semente idempotente. Par SQLite: 0077.
-- REVERSÃO: `DELETE FROM flags WHERE chave = 'latencia_publicada'` (flag ausente é desligada).
INSERT INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'latencia_publicada',
  'Latência publicada por aparelho (openspec latencia-publicada-por-aparelho): com a flag ligada E com `rum_latencia` ligada, o app lê o arquivo estático `latencia.json` (agregado semanal por classe de aparelho e idioma, só células com 200 falas ou mais) e mostra o selo "metade das legendas aparece em até X s" perto do Iniciar da captura; o site gera a página /desempenho e o admin mostra o painel. Desligada, o app não pede o arquivo e a página não existe. Sem coleta nova. LIGAR EM PRODUÇÃO DEPENDE DO PARECER DE PRIVACIDADE DO DONO e de uma semana com 6 ou mais células ok. Ligar é ato do dono.',
  false, '{}', NULL, 1794800000014, 'semente')
  ON CONFLICT (chave) DO NOTHING;
