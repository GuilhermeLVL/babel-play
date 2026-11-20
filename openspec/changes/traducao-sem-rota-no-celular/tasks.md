## 1. Cobertura e rota pelo inglês

- [x] 1.1 Criar `src/core/traducao/coberturaNoAparelho.ts` (pura: par + `{ nativo, nuvemAutorizada, bergamotNoCdn }` → rota e MB). Verificar: `tests/coberturaNoAparelho.test.ts` com a matriz de 20 pares entre {pt, es, fr, it, de} (nenhum `sem-rota`) e o hindi→pt (`sem-rota`).
- [x] 1.2 Em `viaIngles.ts`, `opusMtLocal.ts` (`modelFor`/`viaIngles`/`pernasViaIngles`) e `bergamotModelo.ts` (`parDoPivo`), aceitar es/fr/it/de/pt como origem do pivô quando não há modelo direto para o alvo; perna X→en pelo Bergamot com CDN, senão opus-mt. Verificar: testes de `opusMtLocal`/`bergamotModelo` atualizados (`npx vitest run tests/` dos dois) e o teste que prende as listas.
- [x] 1.3 `src/gateway/modelCache.ts` e `src/lib/languages.ts` leem a mesma tabela; o aviso de download soma as pernas. Verificar: teste do tamanho anunciado para es→pt com e sem o CDN.
- [x] 1.4 Garantir que a cascata só usa o pivô depois do nativo e da nuvem autorizada. Verificar: teste da cascata com o nativo pronto (0 downloads de modelo local).
  - Com a nuvem consentida, o gateway tira o pivô entre pt/es/fr/it/de da cascata (`localAtende`): ele não aquece nem traduz, e a lista de download não o conta. Teste: `tests/pivoComNuvem.test.ts`.

## 2. Honestidade

- [x] 2.1 `traducaoDaFala.ts` (`degrade`): `translatedText: ''` e `semTraducao` com o motivo; o balão mostra o texto do motivo e "Tentar de novo". Verificar: teste de unidade (o DOM não contém `(original)`) e e2e do balão.
  - Coberto por testes de unidade e de componente (ChatTranscript, HistoricoDoPrototipo e o histórico do intérprete). O e2e do balão não foi escrito.
- [x] 2.2 Exportação, voz do intérprete e "Guardar" tratam a tradução vazia como ausente. Verificar: testes de `exportarConversa.ts` e do vocabulário.
- [x] 2.3 Aviso de par sem rota na escolha de idiomas e no Iniciar de Legendar, por `coberturaNoAparelho`. Verificar: teste de componente com hindi→pt e es→pt; texto revisado pela skill `copy-br-etica`; portões de i18n da CI.
  - O aviso fica em `avisosDoPar`, que aparece na escolha de idiomas e no espaço de gravação, junto do Iniciar. O texto do botão não mudou.

## 3. Cartão de preparo

- [x] 3.1 `pacotesNativos.ts`: prazo de 20 s sem progresso por par e falha quando o disjuntor `chrome-translator` abre; a primeira tradução local tira o `tradutor` do cartão. Verificar: teste com relógio falso (um par falha, o outro parado: o cartão some em 20 s).
  - Feitos: o prazo de 20 s, o "local assumiu" e o descarte da sessão anterior. NÃO foi ligado o gancho do disjuntor `chrome-translator`; o prazo de 20 s cobre o mesmo caso.
- [ ] 3.2 `ModelPrepPanel.tsx` na faixa de avisos, sem sobrepor a lista. Verificar: e2e que compara os retângulos em 375×667, 412×915 e 1280×800.
  - Pendente. O cartão já está no fluxo da faixa de avisos (não é absoluto), e nas rodadas a sobreposição medida foi 0. O e2e das três janelas não foi escrito. Ver `openspec/audits/2026-11-17-traducao-sem-rota-medicao.md`.
- [x] 3.3 `ModoInterprete.tsx:768-780`: `comoInstalarVoz` antes do progresso de preparo. Verificar: teste de componente com voz ausente e preparo em curso.
  - Testado na função pura `avisoComAVozPrimeiro`, sem teste de componente.

## 4. 2ª sessão

- [x] 4.1 Marcas `performance.mark` na carga do STT, na carga do MT e na fila do worker de tradução, expostas ao harness. Verificar: as marcas aparecem em `resultado.json` de `celular/medir-celular.mjs`.
  - Elas aparecem na cópia da bancada usada na medição. O `medir-celular.mjs` versionado em `reports/` não foi alterado.
- [ ] 4.2 Medir 5 pares de sessões com ordem alternada (`celular/rodar-visitante.sh` + `celular/latencias.mjs`) e registrar a causa em `openspec/audits/`. Verificar: relatório com p50/p95 por sessão e a causa sustentada pelas marcas.
  - Parcial. Foram 4 pares de sessões contra o build local (3 no iPhone, 1 no Pixel), sem a alternância de 5 pares. As marcas mostram as cargas do STT e do MT em série e a fila do worker ≤ 1: a disputa não se reproduziu. Relatório em `openspec/audits/2026-11-17-traducao-sem-rota-medicao.md`.
- [ ] 4.3 Aplicar a correção que a medição apontar (adiar o `preload` do MT até o STT estar pronto, ou serializar as cargas sem isolamento). Verificar: p50 da 2ª sessão no máximo 1,2× o da 1ª e máximo abaixo de 8 s, nos dois aparelhos.
  - Não aplicada, porque a medição não apontou causa. No build local a 2ª sessão ficou em 0,96× (iPhone) e 0,95× (Pixel) da 1ª, com máximos de 7,1 s e 6,7 s.
- [x] 4.4 `oferecerNativoOuNuvem`: mostrar o aviso sempre que for registrado. Verificar: teste do regulador (log e aviso andam juntos).

## 5. Verificação ponta a ponta

- [x] 5.1 Rodar `celular/medir-celular.mjs --aparelho iphone14 --cenario mercado` e `--aparelho pixel7` contra o staging. Verificar: `linhasSemTraducao` = 0 em `analise.json`.
  - Rodado contra o BUILD LOCAL (edição estática), não contra o staging: 0/9 linhas sem tradução no iPhone e no Pixel, na 1ª e na 2ª sessão, com opus-mt e com Bergamot (a auditoria mediu 9/9). A repetição no staging fica com o dono.
- [ ] 5.2 Rodar `celular/juiz-traducao.mjs` nas traduções es→pt. Verificar: nota média de pelo menos 3/5.
  - NÃO ATINGIDO. Juiz só da tradução: 2,33 e 2,56 com o opus-mt nas duas pernas, 2,89 com o Bergamot es-en. O juiz da auditoria (STT + MT juntos) deu 1 correta, 3 parciais, 3 erradas e 1 perigosa.
- [ ] 5.3 Medir a memória da aba no cenário mercado. Verificar: no máximo +300 MB sobre a rodada en→pt de referência.
  - O opus-mt nas duas pernas fica dentro do teto (+185/+206 MB). O Bergamot es-en + opus-mt en→pt PASSA do teto: +726 MB na 1ª sessão e +316 MB na 2ª.
- [x] 5.4 `npm run typecheck`, `npm run lint` e `npm test` verdes.
  - typecheck verde, lint dos arquivos alterados verde e `npx vitest run` verde. O `npm run lint` completo fica para a CI.
