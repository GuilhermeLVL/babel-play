## 1. Medicao antes

- [x] 1.1 `scripts/perf/medir-rotas.mjs`: tamanho por chunk (gzip, como viaja) e p50/p90 + bytes por rota. Linha de base e resultado em `docs/auditoria-performance.md`. **O proprio script foi corrigido no caminho:** a primeira versao chamava de "arranque" tudo que se chamasse `index*` ou `vendor-*` e somava o `vendor-supabase` (56 KB gz), que e carregado por `import()` atras de um gate — anunciava 392 KB para um arranque de 212. Agora ele le o `dist/index.html` e conta o que a pagina de fato pede. Numero inflado teria mandado otimizar o lugar errado.

## 2. Arranque

- [x] 2.1 `src/lib/galeria/passe.ts` (um `export * from '@core'`) removido; a tela do Passe importa de `@core/passe`. **Sem efeito medivel no arranque**, e a razao esta registrada: o alvo real do achado A43 era o catalogo mestre (129 KB) dentro do chunk de entrada, e ele saiu de `main` com `linha-de-base-verde`. `core/index.ts` continua com os seus `export *` — sao modulos pequenos do nucleo, e removi-los sem numero que os acuse seria churn.
- [x] 2.2 `eventosDeJogo` importado de UMA forma: `juice.ts` o importava estaticamente na linha 2 e dinamicamente na 240, "para nao criar ciclo" — ciclo que nao existe (`madge --circular`: nenhum) e que a propria linha 2 ja teria criado. O aviso do build sumiu e o modulo voltou a ser movivel entre chunks. **Nao feito:** `manualChunks` para `recharts`/`transformers` — os dois JA saem em chunks proprios sob demanda (`AreaChart` 103 KB gz, workers 155 KB gz), entao a regra so fixaria por escrito o que o Rollup ja faz.
- [ ] 2.3 Arranque gzip < 120 KB. **Nao alcancado, e o alvo foi restabelecido com o numero:** 211,8 KB gz = app 125,8 + react 59,3 + CSS 26,8. O alvo de 120 KB foi calibrado com o catalogo de 129 KB dentro do chunk; sem ele, cortar o que resta e decidir o que sai da primeira pintura — trabalho de produto, nao de bundler. Registrado em `docs/auditoria-performance.md`.

## 3. Payloads

- [ ] 3.1 `GET /api/vocab/resumo`. **Nao feito, deliberadamente.** Ele so vale se o lobby parar de baixar o baralho — e o baralho e o que alimenta `composicaoLocal`, o fallback que monta a rodada no cliente quando o servidor nao responde e o UNICO caminho no modo anonimo. Criar a rota agora seria entregar um endpoint sem chamador; a decisao pertence a `modo-anonimo-em-paridade`, dona da paridade entre as duas pontas.
- [x] 3.2 **O ganho grande desta change:** o baralho inteiro deixou de ser rebaixado a cada rodada. `aoTerminar` fazia `setDeck(await fetchDeck())` no fim — 2,17 MB e 134 ms, medidos, por rodada; dez rodadas seguidas eram 22 MB para atualizar a data de revisao de algumas dezenas de cartas. As cartas que mudaram JA voltavam nas respostas de `reviewCard` e `bulkAddCards`, e essas respostas eram descartadas. Agora sao costuradas no baralho local.
- [x] 3.3 Medido: nenhuma rota do lobby acima de 300 KB **exceto** `GET /api/vocab` (2,17 MB), que continua sendo a abertura da tela — ver 3.1 para o motivo de nao ter sido trocada.

## 4. Perfil

- [x] 4.1 `computeProfile` parou de fazer `SELECT *` nas cinco tabelas: le so as colunas que usa. `utterances` trazia `source_text` e `translated_text` — o transcrito inteiro de todas as sessoes — para contar palavras; `vocab_cards` tem 34 colunas e o perfil le treze. **Medido: 95 ms → 43 ms p50** na mesma base de 2.818 cartoes. **Desvio da proposta:** ela pedia agregacao em SQL (`COUNT`/`SUM`/`GROUP BY`). Reescrever a agregacao inteira e trocar ~200 linhas de JS testado por SQL novo num payload contratado (`audit-m06-appmetrics-contract`) — risco alto para os 3 ms que faltavam ao alvo de 40 ms. As colunas entregaram 55% do tempo sem tocar em uma linha de logica.
- [x] 4.2 `Metrics` recebe `metrics` do `App`. Ela chamava `fetchMetrics()` por conta propria enquanto o `App` ja tinha chamado: duas execucoes de `computeProfile` por abertura de tela. O fallback local continua para quem montar a tela sem a prop.
- [x] 4.3 `migrarLeitnerParaFsrs` deixou de varrer o acervo a cada boot — feito em `servicos-sem-duplicata` (`box > 1` na consulta + teto de 5.000).

## 5. Medicao depois

- [x] 5.1 Antes e depois em `docs/auditoria-performance.md`, com o comando para repetir.
- [x] 5.2 `npm test` (2.855) e e2e (18/18) verdes. **Nao feito:** Lighthouse — ele mede LCP no navegador e as mudancas desta change sao de rede e de servidor (uma requisicao a menos, uma resposta 50 vezes menor por rodada); o numero do LCP nao as distingue do ruido de uma execucao para outra.
