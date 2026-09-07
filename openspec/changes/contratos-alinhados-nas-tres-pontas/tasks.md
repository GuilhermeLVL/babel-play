## 1. Tipos em um lugar

- [ ] 1.1 Schemas Zod de RESPOSTA em `server/validation.ts` para as rotas consumidas; tipos inferidos exportados por `src/core/learning/contract.ts`
- [ ] 1.2 `api.ts`, `apiAnki.ts`, `me.ts` importam os tipos; `rowToVocabCard` espalha a linha (`...row`) e adiciona `daTrilha/daAnki/baralhosAnki`
- [ ] 1.3 PATCH `/vocab/:id` e POST `/vocab/:id/review` devolvem a mesma forma de `GET /api/vocab` (com procedencia)

## 2. Envelope de erro

- [ ] 2.1 `{ error, code?, detalhes? }` em `erroDeRota`, `erroGlobal` e nas rotas com formato proprio (billing, metrics, storageQuota, sttProxy, mtProxy, ai/proxy, images, erros)
- [ ] 2.2 `apiFetch` devolve `code`/`detalhes` ao chamador; `gastarSeeds`, `gastarCreditos`, `uploadAudio`, `createSession` propagam `preco`/`falta`/`capBytes`/`TETO_ANONIMO`
- [ ] 2.3 IChat: `res.ok` + `reason` → mensagem por motivo
- [ ] 2.4 `erroDeRota.ts:54` loga `warn` em 4xx, `error` so em 5xx

## 3. Anki

- [ ] 3.1 Cursor opaco `valor:id` em um parametro; `apiAnki.ts` tipa string; `BaralhosAnki` pagina ate o fim
- [ ] 3.2 Enum `estado` unico (decidir se `descartada` existe); `porMotivo` parseado
- [ ] 3.3 `ImportAnkiResposta` inclui `avisoIdioma` e a tela mostra; remover `lerBaralhoAnki`/`LeituraAnki`

## 4. Efemero e sessao

- [ ] 4.1 Efemero `POST /api/sessions` honra `origemLocalId` e devolve `jaExistia`; `teto: null`
- [ ] 4.2 `aliviarListagem` em `GET /sessions/:id` e nos PATCH que devolvem `meta`

## 5. Testes de contrato

- [ ] 5.1 `tests/contratos/<rota>.test.ts`: fixture unico → Express (harness efemero de banco) e `servidorEfemero` → mesmas chaves e tipos
- [ ] 5.2 Cobrir: sessions (6), vocab (7), exercises (5), metrics (5), settings (2), me (2), anki (6), billing (3), import (2), ai (3)
- [ ] 5.3 `npm test` e `npm run typecheck` verdes
