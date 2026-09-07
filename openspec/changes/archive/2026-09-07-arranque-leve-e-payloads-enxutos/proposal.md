## Why

Medido na Fase 3 de `openspec/audits/2026-09-07-coerencia.md` (build de producao para o scratchpad; servidor de dev sobre copia do banco com 2.818 cartoes; 15 requisicoes por rota via 127.0.0.1):

- **Arranque**: `index-Q6_HRh40.js` 517 KB (166 KB gzip) + `vendor-react` 194 KB (61 KB) + CSS 298 KB (38 KB). O chunk de arranque contem o catalogo mestre de cosmeticos (129 KB de fonte; `suite_ouro_imperial` encontrado dentro dele), puxado por `src/core/index.ts:56` (`export * from './catalogoMestre'`) e por `src/lib/galeria/passe.ts:3` (`export * from '@core'`). Todo visitante do hub baixa o catalogo da loja.
- **Deck inteiro por requisicao**: `GET /api/vocab` devolve 2,27 MB (189 KB gzip) em 152 ms e e chamado pelo lobby (`Play.tsx:1324`), por `Metrics` e apos cada rodada (`Play.tsx:1293`, "list() roda depois de cada rodada" — `vocab.ts:151`). O lobby usa contagens e um recorte; a rodada vem de `para-jogo` (84 KB, 25 ms).
- **Perfil duas vezes**: `computeProfile` (100 ms, 11 consultas, carrega todas as `utterances`, `vocab_cards`, `review_logs` e `exercise_results` do usuario e agrega em JS, `metrics.ts:54-60`) e chamado por `App.tsx:421` e de novo por `Metrics.tsx:144` na mesma tela.
- `migrarLeitnerParaFsrs` varre `vocab_cards` em todo boot do primario (`manutencao.ts:77`, `server.ts:523-535`).
- Avisos do build: `eventosDeJogo.ts` importado estatica e dinamicamente (`juice.ts`); 4 chunks acima de 500 KB. `Play.tsx` tem 3.714 linhas (20 `useState`, 18 `useEffect`, 30 `useMemo`, 0 `memo`); `LiveCapture.tsx` 4.257 (40/39/4/0).
- Consultas: todas indexadas (`EXPLAIN QUERY PLAN`), sem SCAN; o custo nao esta no SQL.

## What Changes

- Catalogo fora do arranque: `core/index.ts` deixa de re-exportar `catalogoMestre` e `galeria/passe.ts` deixa de re-exportar `@core`; o catalogo e importado sob demanda por `Loja`. Alvo medido: chunk de arranque < 120 KB gzip.
- `GET /api/vocab` deixa de ser o pool do lobby: o lobby usa `GET /api/vocab/resumo` (contagens por fonte/idioma/recorte, uma consulta agregada) e `para-jogo` para a rodada; `Metrics` usa `GET /api/vocab/pagina`; apos a rodada, so os cartoes tocados sao relidos. Alvo: nenhuma tela baixa mais de 300 KB para abrir.
- `computeProfile` agrega em SQL (`COUNT`/`SUM`/`GROUP BY` sobre os indices existentes) em vez de carregar linhas; `App` passa `metrics` a `Metrics` (uma chamada por tela). Alvo: < 40 ms na mesma base.
- `migrarLeitnerParaFsrs` roda uma vez (marca).
- `eventosDeJogo` importado de uma forma; `manualChunks` para `recharts` e `@huggingface/transformers` explicitos; `chunkSizeWarningLimit` nao e elevado.
- Medicoes repetidas com o mesmo script (`scripts/perf/medir-rotas.mjs`, novo) e registradas no PR.

## Capabilities

### New Capabilities
- `arranque-e-payloads-medidos`: o tamanho do arranque e das respostas das telas principais tem alvo numerico e script de medicao.

## Impact

- `src/core/index.ts`, `src/lib/galeria/passe.ts`, `src/components/views/{Loja,Play,Metrics}.tsx`, `src/App.tsx`, `src/data/api.ts`, `src/lib/juice.ts`, `vite.config.ts`
- `server/routes/vocab.ts` (`/resumo`), `server/db/repositories/{vocab,metrics}.ts`, `server/db/manutencao.ts`
- Novo `scripts/perf/medir-rotas.mjs`; `docs/auditoria-performance.md` atualizado com os numeros
- Remove: re-exports do catalogo no barril; `fetchDeck` como fonte do lobby; segundo `fetchMetrics`

## Pronto quando

Script de medicao mostra: arranque gzip < 120 KB; `/api/vocab/resumo` < 20 KB; perfil < 40 ms com a base de 2.818 cartoes; nenhuma rota do lobby acima de 300 KB; `npm test` e e2e verdes; Lighthouse do `/jogar` sem regressao de LCP.

## Dependencias e paralelismo

Depende de `linha-de-base-verde` e de `contratos-alinhados-nas-tres-pontas` (tipos de resposta). Nao paralelizar com `seeds-e-creditos-fonte-unica` (mesmos `metrics.ts`/`api.ts`) nem com `idioma-alvo-e-ui-respeitados` (`Metrics.tsx`).
