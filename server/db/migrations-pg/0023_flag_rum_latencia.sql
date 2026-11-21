-- FLAG `rum_latencia` (openspec lab-medicao-legenda-traduzida, tarefa 5.1): telemetria de campo da latência da legenda traduzida.
-- Constante `FLAG_RUM_LATENCIA` em `src/core/planos.ts`. NASCE DESLIGADA, SEM REGRA DE PLANO (`regras = '{}'`).
-- LIGAR EM PRODUÇÃO DEPENDE DO PARECER DE PRIVACIDADE DO DONO (LGPD art. 14, ECA Digital) registrado em `docs/`.
-- Semente idempotente (`ON CONFLICT DO NOTHING`): rodar de novo não desliga o que o operador ligou. Par SQLite: 0065.
-- REVERSÃO: `DELETE FROM flags WHERE chave = 'rum_latencia'` (flag ausente é desligada).
INSERT INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'rum_latencia',
  'Telemetria de campo da latência da legenda (openspec lab-medicao-legenda-traduzida, grupo 5): com a flag ligada, o cliente que já pode enviar métricas (consentimento "Métricas de uso anônimas", conta ou self-host, adulto com idade declarada) manda o lote `v: 2` com baldes e contagens por classe de aparelho, idioma-base e motor/fase de lista fechada, nunca texto, id ou hora; o servidor só incrementa histogramas. Desligada, sai só o `v: 1` de hoje. LIGAR EM PRODUÇÃO DEPENDE DO PARECER DE PRIVACIDADE DO DONO (LGPD art. 14, ECA Digital) registrado em `docs/`. Ligar é ato do dono.',
  false, '{}', NULL, 1794800000003, 'semente')
  ON CONFLICT (chave) DO NOTHING;
