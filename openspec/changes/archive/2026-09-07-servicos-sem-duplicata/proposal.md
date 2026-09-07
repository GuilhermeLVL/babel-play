## Why

O servidor tem varias implementacoes da mesma responsabilidade, com politicas diferentes, e leituras sem validacao (achados A24, A27-A32, A53, A55 de `openspec/audits/2026-09-07-coerencia.md`):

- **Sete clientes LLM** para o mesmo `POST /chat/completions`: `server.ts:242-278` (Ollama, 60 s, URL cravada `:240`), `server.ts:289-331` (Groq, 30 s), `server.ts:378-388` (Gemini SDK, modelo `gemini-2.0-flash` cravado `:379`), `server/ai/proxy.ts:22-66` (BYOK, 60 s, repassa `req.body` inteiro `:36` sem teto de prompt), `server/ai/mtProxy.ts:33-230` (12 s, cascata `LLM_RESERVA_*`), `src/gateway/adapters/openaiCompatible.ts` (sem timeout; `chatStream` sem chamador), `serverLlmMt.ts`. `openai/gpt-oss-120b` em 3 copias; `whisper-large-v3-turbo` em 3; `Onboarding.tsx:25` sugere `llama-3.3-70b-versatile`, que o proprio `mtProxy.ts:69-72` registra como `model_not_found`.
- **Dois rate limiters na mesma linha**: `server.ts:93` e `:118` criam stores com `metric='ratelimit'`, mesma chave e mesma janela (`rateLimitStore.ts:22,45`); `expensiveLimiter` (60/min) e `writeLimiter` (120/min) se canibalizam.
- **`usage_counters` com quatro escritores**: `usageQuota.ts` (fail-open), `storageQuota.ts:106-163` (upsert proprio, fail-closed, reimplementa `reserve`/`refund` de `usageCounters.ts:69,111`), `rateLimitStore.ts`, o repositorio; o comentario do schema (`schema.ts:578-579`) lista metricas erradas.
- **12 leituras sem schema**: `proxy.ts:36,71-72`, `sttProxy.ts:85-86` (headers), `sessions.ts:272,287,306,332`, `vocab.ts:148`, `admin.ts:45,63,74`, `images.ts:40`; `prepareLlmRequest` (`llmRequest.ts:42`) e um validador manual paralelo ao Zod.
- **Erro engolido com 200**: `import.ts:312` (ativacao falha → `ativadas: 0`), `import.ts:346` (ledger preso em `gravando`), `sessions.ts:206-209` (audio antigo nao removido → `{ok:true}`); `erroDeRota.ts:54` loga `error` em 400.
- **Copias**: `baseLang` x4 (`languages.ts:104`, `alucinacao.ts:26`, `youtube.ts:76`, `quality.ts:58`); leitura de `meta` JSON x6; `isLocalUrl` x2; `ROMANCE` x4; 3 resolvedores de diretorio de audio; 2 guardas de path traversal; 5 normalizadores de chave de palavra; STOPWORDS (`keywords.ts:16-45`) = GRAMATICAIS (`quality.ts:73-100`); `FiltroPersistido` = `FiltroDaPratica`.
- **Legado vivo**: `POST /api/exercises/results` (`exercises.ts:62`, schema sem `cardId`) ao lado de `/rodada`, chamado por `Study.tsx:206,922`; `migrarLeitnerParaFsrs` varre `vocab_cards` a cada boot.

## What Changes

- `server/ai/llmClient.ts`: um cliente OpenAI-compatible com timeout, teto de prompt, `max_tokens` e modelo vindos de `config`; `/api/gemini/chat`, `mtProxy` e `proxy` o usam; Gemini SDK entra como provedor do mesmo cliente; modelos e URLs (`OLLAMA_URL`, `GEMINI_MODEL`, `LLM_MODEL`, `STT_MODEL`) so via `config.ts`. `Onboarding.tsx:25` deixa de sugerir modelo morto (lista vem do servidor).
- Rate limit: `metric` distinto por limitador (`ratelimit:caro`, `ratelimit:escrita`).
- `usage_counters`: `usageCountersRepo` e o unico escritor; `storageQuota` usa `reserve`/`refund` do repo; politica de falha unica e documentada; comentario do schema corrigido.
- Zod em todas as 12 leituras; `prepareLlmRequest` reescrito como schema; params de rota validados por `idParamSchema` em todos os handlers.
- Falha nao vira 200: ativacao Anki e remocao de audio respondem `{ok:false, code}` (ou 207 com detalhe); ledger de import sempre chega a estado final; `erroDeRota` loga `warn` em 4xx.
- Uma implementacao por utilitario: `src/core/texto/{chave,baseLang}.ts`, `server/lib/{meta,armazenamentoDir,pathSeguro}.ts`; STOPWORDS unica em `core/learning/stopwords.ts`; `FiltroPersistido` some.
- `POST /api/exercises/results` removido; `Study` grava por `/rodada`. `migrarLeitnerParaFsrs` guardada por marca (`settings` global ou tabela `manutencao`).

## Capabilities

### New Capabilities
- `uma-implementacao-por-servico`: cada responsabilidade do servidor tem um modulo, uma politica e um schema.

## Impact

- `server.ts`, `server/ai/{llmClient (novo),llmRequest,proxy,mtProxy,sttProxy}.ts`, `server/lib/{config,rateLimitStore,usageQuota,storageQuota,erroDeRota,meta,armazenamentoDir,pathSeguro}.ts`, `server/routes/{ai,admin,sessions,vocab,images,import,exercises}.ts`, `server/db/repositories/usageCounters.ts`, `server/db/manutencao.ts`, `server/db/schema.ts` (comentario)
- `src/core/texto/*`, `src/core/learning/{keywords,quality,stopwords}.ts`, `src/lib/{languages,filtroDaPratica}.ts`, `src/gateway/{alucinacao,index,activeProfile}.ts`, `src/components/Onboarding.tsx`, `src/components/views/Study.tsx`, `src/data/api.ts`
- Remove: `tryOllamaChat`/`tryGroqChat` inline; `prepareLlmRequest` manual; `chatStream`/SSE do proxy; `POST /exercises/results` + `saveExerciseResult` + `exerciseResultSchema`; 3 `baseLang`; 5 `readMeta`; `FiltroPersistido`; GRAMATICAIS duplicado; `resolveInAudioDir` duplicado

## Pronto quando

`jscpd` sem clones entre os pares listados; `knip` sem os exports removidos; teste de integracao prova que 61 requisicoes a `/api/sessions` em um minuto nao bloqueiam a 61a a `/api/ai`; `tests/integration/validacao-input.test.ts` cobre os 12 pontos; ativacao Anki falha → resposta nao-200 em teste; `npm test` verde.

## Dependencias e paralelismo

Depende de `linha-de-base-verde` e de `contratos-alinhados-nas-tres-pontas` (compartilha `validation.ts` e o envelope de erro). Paralelizavel com `idioma-alvo-e-ui-respeitados`, `replica-sem-estado-local-e-config-completa` (coordenar `config.ts`), `jogos-culturais-dentro-do-sistema`.
