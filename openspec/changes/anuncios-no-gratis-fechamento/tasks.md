# Tarefas

> Só spec. **[D]** = ato do dono; **[R]** = aparelho real. Em toda tarefa: `npm run typecheck`, `npm run lint` e os testes dos arquivos tocados.

- [ ] 1.1 **[R]** Teste real de um anúncio com o isolamento ligado, em página de bancada. Verificar: relatório com a página, o isolamento e se o anúncio carregou.
- [ ] 1.2 **[D]** Parecer jurídico (ECA Digital, LGPD, preço v4, anual, anúncios) anexado em `docs/`; regra de idade da política conferida contra ele.
- [ ] 1.3 **[D]** Conferir no Asaas e nos bancos que não há cobrança nos valores da v3 (R$ 9,90, R$ 19,90, R$ 39,90, R$ 179) e que o sandbox cobra o Plus.
      Verificar: `docs/LANCAMENTO.md` §10 com data e print; `tests/integration/billing-por-plano.test.ts` verde.
- [ ] 1.4 Tabela momento × oferta × teste (fim das horas, áudio difícil, celular, Quest), cada linha com um teste; copy pela skill `copy-br-etica`.
      Parte já feita em `src/core/ofertas.ts` e `tests/ofertas-*.test.ts`.
- [ ] 1.5 **[D]** Abrir o mensal do Plus antes do parecer; anual só depois (`ANUAL_ENABLED`).
