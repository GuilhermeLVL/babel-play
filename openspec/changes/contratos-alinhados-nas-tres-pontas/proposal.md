## Why

O cliente, o servidor Express e o servidor efemero discordam sobre a forma de 15 respostas, e nada no repositorio prende os tres (secao "contratos" de `openspec/audits/2026-09-07-coerencia.md`, achados A19-A23, A25, A30, A62):

- `rowToVocabCard` (`src/data/api.ts:342-416`) nao copia `occurrences`, `difficultyScore`, `cefrSource`, `lastSeenAt`; `Play.tsx:1610-1613` le esses campos e recebe `null`, esvaziando o recorte "dificeis" no fallback local. `PATCH /vocab/:id` e `POST /vocab/:id/review` devolvem a linha crua sem `daTrilha/daAnki/baralhosAnki` (`server/routes/vocab.ts:136,148`), zerando a procedencia do cartao editado.
- Paginacao de notas Anki (EXEC): `proximoCursor` e `{valor,id}` (`repositories/anki.ts:440`), o cliente tipa string (`apiAnki.ts:59`), envia `[object Object]` e nunca manda `cursorId` (`routes/anki.ts:51`); `estado=descartada` responde 400 (`validation.ts:499`); `porMotivo` chega como string JSON (`apiAnki.ts:74`).
- `IChat.tsx:457-474` faz `res.json()` sem `res.ok` e ignora `reason`; 402/413/501 viram "instale o Ollama".
- Efemero `POST /api/sessions` ignora `origemLocalId` e nunca devolve `jaExistia` (`servidor.ts:117-145`); migracao repetida duplica.
- Nove formatos de erro; `erroGlobal.ts:78-86` usa `{error:{code,message,requestId}}`, incompativel com `body.error` string; nenhum arquivo em `src` le `code` nem `codigo`; `preco`, `falta`, `saldo`, `usedBytes`, `capBytes`, `entitlement`, `provenance`, `captionErro`, `avisoIdioma`, `reason` nunca chegam a UI.
- `LeituraAnki`/`lerBaralhoAnki` (`api.ts:452-479`) descrevem uma resposta que a rota nao devolve mais; `ImportAnkiResposta` (`BaralhoAnki.tsx:54-65`) omite `avisoIdioma` e `estruturaHash`.
- `GET /sessions/:id` e os PATCH devolvem a capa `data:` URI inteira (`sessions.ts:136,274,289,334`) que a listagem ja tira.

## What Changes

- **Tipos de resposta em um lugar**: `src/core/learning/contract.ts` passa a exportar os tipos de resposta inferidos dos schemas Zod de saida (`server/validation.ts` ganha schemas de resposta para as rotas consumidas); `api.ts`, `apiAnki.ts`, `me.ts` importam dali. `rowToVocabCard` espalha a linha e adiciona derivados.
- **Um envelope de erro**: `{ error: string, code?: string, detalhes?: object }` em todas as rotas e no `erroGlobal`; `apiFetch` expõe `code`/`detalhes` ao chamador; as telas mostram o motivo (`preco`, `falta`, `capBytes`, `reason`, `entitlement`).
- **Anki**: cursor opaco (`valor:id`) em um unico parametro; enum de `estado` unico entre cliente, schema e banco (`descartada` existe ou some dos tres); `porMotivo` parseado no repositorio.
- **Efemero**: honra `origemLocalId` e devolve `jaExistia`; devolve `teto: null`; mesmas formas do Express.
- **Sessao**: `aliviarListagem` aplicado a toda resposta que devolve `meta`.
- **Testes de contrato**: para cada rota consumida, um teste que executa o handler Express e o handler do efemero com o mesmo fixture e compara as formas (chaves e tipos) — o harness `tests/harness/ephemeralDb.ts` e `src/data/efemero/servidor.ts` ja permitem.

## Capabilities

### New Capabilities
- `contrato-unico-de-api`: cliente, Express e efemero compartilham tipos e envelope de erro, presos por teste.

## Impact

- `server/validation.ts`, `server/lib/erroGlobal.ts`, `server/lib/erroDeRota.ts`, `server/routes/{vocab,anki,sessions,metrics,billing,import,ai}.ts`, `server/db/repositories/anki.ts`, `server/lib/capaDeSessao.ts`
- `src/core/learning/contract.ts`, `src/data/{api,apiAnki,me}.ts`, `src/lib/{carteira,uso,entitlements}.ts`, `src/components/{IChat,views/BaralhosAnki,views/BaralhoAnki,views/vocab/CatalogoDePalavras}.tsx`, `src/data/efemero/servidor.ts`
- Novo `tests/contratos/*.test.ts` (uma suite por rota)
- Remove: `lerBaralhoAnki`, `LeituraAnki`, `NotaAnki`, `sessionToRecording` (se nao usado), `rowToVocabCard` manual, os 8 formatos de erro alem do envelope

## Pronto quando

`tests/contratos` cobre as rotas da tabela do relatorio com fixture unico contra Express e efemero; `npm run typecheck` prova que `api.ts` usa os tipos de `contract.ts`; paginacao de notas percorre 3.600 notas sem repetir; IChat mostra "requer plano Pro" quando `reason = managed_requires_pro`; migracao anonima repetida nao duplica sessao.

## Dependencias e paralelismo

Depende de `linha-de-base-verde`. Paralelizavel com `posse-de-cosmeticos-uma-regua`, `jogos-culturais-dentro-do-sistema`, `idioma-alvo-e-ui-respeitados`. Precede `seeds-e-creditos-fonte-unica`, `modo-anonimo-em-paridade`, `servicos-sem-duplicata` e `arranque-leve-e-payloads-enxutos` (todas tocam `api.ts`/`validation.ts`).
