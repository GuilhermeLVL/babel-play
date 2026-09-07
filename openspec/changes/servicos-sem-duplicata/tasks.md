## 1. Um cliente LLM

- [ ] 1.1 `server/ai/llmClient.ts` (timeout, teto de prompt, max_tokens, modelo, provedor) lendo `config.ts`
- [ ] 1.2 `/api/gemini/chat`, `mtProxy`, `proxy` usam o cliente; remover `tryOllamaChat`, `tryGroqChat`, SDK Gemini inline
- [ ] 1.3 `OLLAMA_URL`, `GEMINI_MODEL`, `LLM_MODEL`, `STT_MODEL` declarados em `config.ts` e `.env.example`; catalogo de modelos servido por `GET /api/ai/modelos`; `Onboarding.tsx:25` consome
- [ ] 1.4 Remover `chatStream`/SSE sem chamador

## 2. Contadores e limitadores

- [ ] 2.1 `metric` distinto por limitador; teste de nao-colisao
- [ ] 2.2 `storageQuota` usa `usageCountersRepo.reserve/refund`; politica de falha unica documentada
- [ ] 2.3 Comentario de `schema.ts:578-579` corrigido; teste que lista as metricas reais

## 3. Validacao e erro

- [ ] 3.1 Zod nos 12 pontos (headers do STT, `req.body` do proxy com teto, params de sessions/vocab/admin, query de admin/images)
- [ ] 3.2 `prepareLlmRequest` → `llmChatSchema`
- [ ] 3.3 `import.ts:312,346` e `sessions.ts:206-209`: falha reportada (nao 200 silencioso); ledger sempre final
- [ ] 3.4 `erroDeRota.ts:54`: `warn` em 4xx

## 4. Uma implementacao por utilitario

- [ ] 4.1 `src/core/texto/chave.ts` e `baseLang.ts`; 5 normalizadores e 4 `baseLang` passam a importar
- [ ] 4.2 `server/lib/meta.ts` (leitura de `meta`), `armazenamentoDir.ts`, `pathSeguro.ts`
- [ ] 4.3 `core/learning/stopwords.ts` unico; `FiltroPersistido` removido

## 5. Legado

- [ ] 5.1 Remover `POST /api/exercises/results`, `saveExerciseResult`, `exerciseResultSchema`; `Study` usa `/rodada`
- [ ] 5.2 `migrarLeitnerParaFsrs` com marca de "ja migrado"
- [ ] 5.3 `jscpd`, `knip`, `npm test` verdes
