## 1. Cobertura e rota pelo inglês

- [x] 1.1 Criar `src/core/traducao/coberturaNoAparelho.ts` (pura: par + `{ nativo, nuvemAutorizada, bergamotNoCdn }` → rota e MB). Verificar: `tests/coberturaNoAparelho.test.ts` com a matriz de 20 pares entre {pt, es, fr, it, de} (nenhum `sem-rota`) e o hindi→pt (`sem-rota`).
- [x] 1.2 Em `viaIngles.ts`, `opusMtLocal.ts` (`modelFor`/`viaIngles`/`pernasViaIngles`) e `bergamotModelo.ts` (`parDoPivo`), aceitar es/fr/it/de/pt como origem do pivô quando não há modelo direto para o alvo; perna X→en pelo Bergamot com CDN, senão opus-mt. Verificar: testes de `opusMtLocal`/`bergamotModelo` atualizados (`npx vitest run tests/` dos dois) e o teste que prende as listas.
- [x] 1.3 `src/gateway/modelCache.ts` e `src/lib/languages.ts` leem a mesma tabela; o aviso de download soma as pernas. Verificar: teste do tamanho anunciado para es→pt com e sem o CDN.
- [x] 1.4 Garantir que a cascata só usa o pivô depois do nativo e da nuvem autorizada. Verificar: teste da cascata com o nativo pronto (0 downloads de modelo local).

## 2. Honestidade

- [x] 2.1 `traducaoDaFala.ts` (`degrade`): `translatedText: ''` e `semTraducao` com o motivo; o balão mostra o texto do motivo e "Tentar de novo". Verificar: teste de unidade (o DOM não contém `(original)`) e e2e do balão.
- [x] 2.2 Exportação, voz do intérprete e "Guardar" tratam a tradução vazia como ausente. Verificar: testes de `exportarConversa.ts` e do vocabulário.
- [x] 2.3 Aviso de par sem rota na escolha de idiomas e no Iniciar de Legendar, por `coberturaNoAparelho`. Verificar: teste de componente com hindi→pt e es→pt; texto revisado pela skill `copy-br-etica`; portões de i18n da CI.

## 3. Cartão de preparo

- [x] 3.1 `pacotesNativos.ts`: prazo de 20 s sem progresso por par e falha quando o disjuntor `chrome-translator` abre; a primeira tradução local tira o `tradutor` do cartão. Verificar: teste com relógio falso (um par falha, o outro parado: o cartão some em 20 s).
- [ ] 3.2 `ModelPrepPanel.tsx` na faixa de avisos, sem sobrepor a lista. Verificar: e2e que compara os retângulos em 375×667, 412×915 e 1280×800.
- [x] 3.3 `ModoInterprete.tsx:768-780`: `comoInstalarVoz` antes do progresso de preparo. Verificar: teste de componente com voz ausente e preparo em curso.

## 4. 2ª sessão

- [ ] 4.1 Marcas `performance.mark` na carga do STT, na carga do MT e na fila do worker de tradução, expostas ao harness. Verificar: as marcas aparecem em `resultado.json` de `celular/medir-celular.mjs`.
- [ ] 4.2 Medir 5 pares de sessões com ordem alternada (`celular/rodar-visitante.sh` + `celular/latencias.mjs`) e registrar a causa em `openspec/audits/`. Verificar: relatório com p50/p95 por sessão e a causa sustentada pelas marcas.
- [ ] 4.3 Aplicar a correção que a medição apontar (adiar o `preload` do MT até o STT estar pronto, ou serializar as cargas sem isolamento). Verificar: p50 da 2ª sessão no máximo 1,2× o da 1ª e máximo abaixo de 8 s, nos dois aparelhos.
- [x] 4.4 `oferecerNativoOuNuvem`: mostrar o aviso sempre que for registrado. Verificar: teste do regulador (log e aviso andam juntos).

## 5. Verificação ponta a ponta

- [ ] 5.1 Rodar `celular/medir-celular.mjs --aparelho iphone14 --cenario mercado` e `--aparelho pixel7` contra o staging. Verificar: `linhasSemTraducao` = 0 em `analise.json`.
- [ ] 5.2 Rodar `celular/juiz-traducao.mjs` nas traduções es→pt. Verificar: nota média de pelo menos 3/5.
- [ ] 5.3 Medir a memória da aba no cenário mercado. Verificar: no máximo +300 MB sobre a rodada en→pt de referência.
- [ ] 5.4 `npm run typecheck`, `npm run lint` e `npm test` verdes.
