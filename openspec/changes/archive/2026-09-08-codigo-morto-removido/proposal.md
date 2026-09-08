## Why

Codigo sem chamador e duplicado acumulado por varias rodadas de IA em paralelo (achados A50-A59 de `openspec/audits/2026-09-07-coerencia.md`, todos confirmados por execucao de `madge`, `knip`, `jscpd`, `depcheck`, `ast-grep` e `eslint`):

- 15 arquivos de produto sem importador (~2.761 linhas): `MinigamesShowcase.tsx`, `gamificacao/versao{1_arcade,2_cyber,3_odyssey}/*` (12), `shared/StagePreviewLive.tsx`, `shared/ModalCelebracaoRecompensa.tsx`.
- 140 exports e 93 tipos sem uso (knip), entre eles `LeitnerStrategy`/`getScheduler`/`gradeFromCorrect`/`isNewCard`/`getNextCard` (`scheduler.ts`), `estimateCefr` (`cefr.ts:2`, `@deprecated` e reexportado em `core/index.ts:43`), `distribuicao.ts` (so teste), `seedsDoCofreDoPasse` (vira usado em `seeds-e-creditos-fonte-unica`), 11 `play*Sound` (`soundFx.ts`), `api.ts` (`sessionToRecording`, `rowToVocabCard`, `lerBaralhoAnki`, `deleteCredential`), `IDIOMAS_DA_INTERFACE`/`moeda`, `exigeConta` (trio), 5 metodos de repositorio, `chatStream`/SSE.
- Endpoints sem consumidor: `GET /vocab/distribuicao-dificuldade`, `GET /vocab/:id/ocorrencias`, `DELETE /vocab/:id`, os 6 `/api/admin/*` (RBAC sem UI).
- 58 clones exatos (jscpd) e 323 warnings de lint que o CI ignora; 7 `catch {}` em `soundFx.ts`; ciclo `source.ts ↔ filtro.ts` (tipo); dependencias sem uso (`tesseract.js` so em `ocr.ts` morto; `@axe-core/playwright`).

Esta e a ultima change: so remove o que as anteriores nao reaproveitaram.

## What Changes

- Remover arquivos, exports, tipos, rotas e dependencias sem uso que restarem apos as outras changes; para `ocr.ts`/`tesseract.js` e `/api/admin/*`, decisao explicita (ligar a uma tela ou remover) registrada em `design.md`.
- `eslint --max-warnings 0` no CI; `knip` e `jscpd` (limiar) entram no `ci.yml` como gates.
- Quebrar o ciclo `source.ts ↔ filtro.ts` (tipo `FonteDeItens` para `types.ts`).
- Os 7 `catch {}` de `soundFx.ts` ganham motivo escrito ou tratamento; `.catch(() => {})` silenciosos listados em A58 idem.

## Capabilities

### New Capabilities
- `sem-codigo-morto`: o CI recusa arquivo, export ou dependencia sem uso e warning de lint.

## Impact

- Arquivos listados em A50-A56 do relatorio; `eslint.config.js`, `.github/workflows/ci.yml`, `package.json`, `knip.json` (novo), `.jscpd.json` (novo)
- Remove: tudo o que knip/madge/depcheck acusarem apos as demais changes

## Pronto quando

`npx knip` sem achados; `madge --circular` vazio; `depcheck` sem dependencias nao usadas; `eslint --max-warnings 0` verde; `jscpd` abaixo do limiar; `npm test` verde; `ast-grep scan` sem `catch-vazio`.

## Dependencias e paralelismo

Depende de TODAS as outras changes (so sabe o que sobrou depois delas). Nao paralelizavel.
