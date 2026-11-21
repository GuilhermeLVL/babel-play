-- FLAG `rum_latencia` (openspec lab-medicao-legenda-traduzida, tarefa 5.1): telemetria de campo da latência da legenda traduzida.
-- NASCE DESLIGADA, SEM REGRA DE PLANO (`regras = '{}'`). LIGAR EM PRODUÇÃO DEPENDE DO PARECER DE PRIVACIDADE DO DONO.
-- Semente idempotente (`INSERT OR IGNORE`): rodar de novo não desliga o que o operador ligou. Aditiva: só dado.
-- REVERSÃO: `DELETE FROM flags WHERE chave = 'rum_latencia'` (flag ausente é desligada).
INSERT OR IGNORE INTO flags (chave, descricao, habilitada, regras, payload, atualizado_em, atualizado_por) VALUES (
  'rum_latencia',
  'Telemetria de campo da latência da legenda (openspec lab-medicao-legenda-traduzida, grupo 5): com a flag ligada, o cliente que já pode enviar métricas (consentimento "Métricas de uso anônimas", conta ou self-host, adulto com idade declarada) manda o lote `v: 2` com baldes e contagens por classe de aparelho, idioma-base e motor/fase de lista fechada, nunca texto, id ou hora; o servidor só incrementa histogramas. Desligada, sai só o `v: 1` de hoje. LIGAR EM PRODUÇÃO DEPENDE DO PARECER DE PRIVACIDADE DO DONO (LGPD art. 14, ECA Digital) registrado em `docs/`. Ligar é ato do dono.',
  0, '{}', NULL, 1794800000003, 'semente'
);
