## Why

O servidor autoriza gastos (EXEC: `POST /api/metrics/seeds/gastar` com valor errado responde 400 `{error, preco}`), mas so credita conquistas: `conquistaDoCreditoId` (`src/core/economiaAutoridade.ts:127-131`) devolve `null` para `passe:t1:cofre-*` e `drop-partida-bau-*`, e `server/routes/metrics.ts:160-164` responde 400 "credito desconhecido" (EXEC). `seedsDoCofreDoPasse` (`economiaAutoridade.ts:134-140`) foi escrita para isso e nao tem chamador. Consequencias medidas:

- `PasseDeTemporada.tsx:143-144` repete o pedido a cada mount e nunca marca o bau.
- `drops.ts:207-216` anuncia "+40 Seeds" sem credito; no efemero (`servidor.ts:465-476`) credita o `amount` que o cliente mandar, com id nao repetivel (`Date.now()`).
- O banco real prova a regressao: 36 linhas `passe:t1:*` (2.472 Seeds, valores de 10 a 172 enviados pelo cliente) entraram entre 31/08 e 01/09; a mesma rota hoje recusa.
- Conquistas que nunca disparam na conta: `ouvinte` le `capturaMinutos` e `poliglota` le `idiomas`, campos que `computeProfile` nao emite (EXEC); `duelista` depende de `melhorComboPorJogo`, que o servidor real nao devolve porque `melhorSequencia` e descartado por `rodadaSchema` (`validation.ts:125`) e nao ha coluna (EXEC: `/rodada` com `melhorSequencia=9` grava linha sem combo; `/recordes` so `{exerciseKind, melhorPontos, melhorEm, rodadas}`).
- `metrics.ts:77-81` documenta que dois gastos concorrentes passam no saldo (sem transacao).
- O efemero nao tem autoridade (`servidor.ts:436-476`).

Achados A03, A14, A18, A26 e secao 4 (economia) de `openspec/audits/2026-09-07-coerencia.md`.

## What Changes

- `economiaAutoridade` decide TODOS os creditos: `conquista-<id>` (valor da tabela), `passe:<temporada>:cofre-d<N>-<K>` (valor de `slotsDoPasse`, exigindo `passeNivel(xp) >= N*10`), `drop:<dropId>` (40, um por drop registrado). O servidor e o efemero chamam a mesma funcao; `amount`/`xp` do cliente sao ignorados nos dois.
- Drops passam a ser evento do servidor: `POST /api/metrics/drops/registrar` (uma linha por rodada em `seed_credits` com `reason='drop-pendente'`, ou tabela `drops`) e `POST /api/metrics/drops/abrir/:id`; `localStorage` vira cache.
- `exercise_results` ganha `combo` (migration aditiva); `rodadaSchema` aceita `melhorSequencia`; `listarRecordes` devolve `melhorCombo`, `precisao`, `ultimaEm`; `RecordeDoJogo` no cliente e o mesmo tipo.
- `computeProfile` emite `capturaMinutos` e `idiomas` (mesma conta do efemero, `servidor.ts:572,577`).
- Gasto em transacao (`emTransacao`) com releitura do saldo dentro dela.
- Decisao sobre os 2.472 Seeds historicos de passe (pergunta 9): reconciliar contra `slotsDoPasse` por `credito_id` e registrar `ajuste:<id>` para a diferenca, ou manter — registrada em `design.md` e aplicada por script idempotente.

## Capabilities

### New Capabilities
- `credito-com-autoridade`: nenhum credito entra sem o servidor (ou o efemero, com a mesma funcao) decidir o valor.

### Modified Capabilities
- `economia` (change `servidor-e-autoridade`): a autoridade cobre creditos de passe e drop, nao so conquistas e gastos.

## Impact

- `src/core/economiaAutoridade.ts`, `src/core/passe.ts`, `src/core/learning/{xp,conquistas}.ts`
- `server/routes/metrics.ts`, `server/db/repositories/{metrics,economia,exerciseResults,seedSpends}.ts`, `server/validation.ts`, `server/db/schema.ts` + migration `0022_*`
- `src/lib/{drops,conquistas,presenca}.ts`, `src/data/api.ts`, `src/data/efemero/servidor.ts`, `src/components/views/passe/PasseDeTemporada.tsx`, `minigames/{ScratchReward,ResumoDaRodada}.tsx`
- Remove: `creditoId` gerado com `Date.now()`; leitura de `amount`/`xp` do cliente no efemero; `babel.passe_*_creditados` como fonte (vira cache)

## Pronto quando

- `tests/economiaAutoridade.test.ts`: valor de cada familia de `creditoId`; passe de decada nao alcancada recusado; drop so uma vez por id.
- `tests/integration/economia-*.test.ts`: `POST /seeds/creditar` com `passe:t1:cofre-d1-1` em usuario de nivel ≥10 responde 200 idempotente; com nivel 1 responde 402/400; dois gastos concorrentes nao ultrapassam o saldo.
- `tests/recordes.test.ts` + integracao: `/recordes` devolve `melhorCombo`; conquista `duelista` dispara com combo ≥ meta; `ouvinte` e `poliglota` disparam com os campos novos.
- Paridade: o mesmo fixture de creditos contra o efemero e contra o Express da o mesmo saldo.

## Dependencias e paralelismo

Depende de `linha-de-base-verde` e de `posse-de-cosmeticos-uma-regua` (o que e posse e o que e credito). Toca `api.ts`/`metrics.ts`: nao paralelizar com `contratos-alinhados-nas-tres-pontas` nem `arranque-leve-e-payloads-enxutos`; sequencia sugerida: contratos → esta → modo anonimo.
