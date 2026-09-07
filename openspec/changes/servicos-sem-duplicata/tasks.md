> **Escopo entregue.** Foi feito o que a auditoria mediu como DEFEITO — contadores que se
> canibalizavam, falha que virava 200, leitura sem schema, varredura de boot sem teto, rota legada
> viva — mais a consolidação dos clientes de LLM, que era a duplicata com custo real (uma correção
> num lugar deixava seis errados). O que ficou de fora está dito item a item, com o motivo: quase
> tudo por pertencer a outra change que já vai tocar aquele arquivo.

## 1. Um cliente LLM

- [x] 1.1 `server/ai/llmClient.ts`: uma chamada a `POST /chat/completions`, com timeout, teto de prompt (reusa `MAX_PROMPT_CHARS`), `max_tokens` e a explicação da RESPOSTA VAZIA (modelo de raciocínio que gasta o teto pensando) — que existia só dentro do `mtProxy` e agora vale para todos. `server/ai/provedores.ts`: a cadeia de env e os defaults de modelo num lugar; `openai/gpt-oss-120b` estava em três arquivos e a ordem de fallback divergia entre eles.
- [x] 1.2 `/api/gemini/chat` (as duas cópias inline, Ollama e nuvem) e `mtProxy` passam pelo cliente. O que sobrou específico está explícito: 60 s no local (o modelo roda na CPU de quem usa) e 12 s na tradução (alguém espera legenda na tela). **Não feito:** o SDK do Gemini continua como está — ele não fala o protocolo OpenAI, e envolvê-lo no mesmo cliente exigiria um adaptador que hoje teria um único usuário. O modelo dele deixou de ser literal (`GEMINI_MODEL`).
- [x] 1.3 `OLLAMA_URL`, `GEMINI_MODEL`, `LLM_MODEL`, `STT_MODEL` declarados em `config.ts` e `.env.example` (feito em `replica-sem-estado-local-e-config-completa`, que declarou o inventário). **Não feito:** `GET /api/ai/modelos` e o consumo por `Onboarding.tsx` — a tela de onboarding foi reescrita em `idioma-alvo-e-ui-respeitados` e será tocada de novo por `motor-anki-mapeador`; servir o catálogo agora criaria uma rota para um consumidor que muda em seguida. O modelo morto (`llama-3.3-70b-versatile`) não é mais sugerido por default em lugar nenhum do servidor.
- [ ] 1.4 Remover `chatStream`/SSE sem chamador. **Não feito:** é remoção de código morto, escopo de `codigo-morto-removido` (onda 5), que roda por último justamente para saber o que sobrou.

## 2. Contadores e limitadores

- [x] 2.1 `createDbRateLimitStore(metric)` com `ratelimit:caro` e `ratelimit:escrita`. Os dois limitadores contavam no MESMO balde: 60 salvamentos de transcrição esgotavam a cota de IA da pessoa, e o `RateLimit-Remaining` não correspondia a nenhum dos tetos. Teste novo: `tests/integration/limitadores-nao-se-canibalizam.test.ts`.
- [ ] 2.2 `storageQuota` usar `usageCountersRepo.reserve/refund`. **Não feito:** as duas políticas de falha são DIFERENTES de propósito — a quota de IA degrada aberta (não bloquear quem paga por um erro nosso) e a de armazenamento degrada fechada (não aceitar byte que não cabe). Unificar o escritor sem unificar a política seria esconder a decisão dentro de um parâmetro. Fica para quando a política for decidida, e a decisão não é técnica.
- [ ] 2.3 Comentário de `schema.ts:578-579`. **Não feito:** cosmético, e o arquivo é tocado por `schema-sem-tabela-orfa`.

## 3. Validação e erro

- [x] 3.1 `idParamSchema` nos handlers de `sessions` que liam `req.params` cru (PATCH `/:id`, PUT `/:id/utterances`, PATCH `/:id/meta`). Os demais pontos da lista já validavam ou foram cobertos por `contratos-alinhados-nas-tres-pontas`.
- [ ] 3.2 `prepareLlmRequest` → `llmChatSchema`. **Não feito:** ele já é um validador com teto e testes (`audit-s06-llm-request.test.ts`); reescrevê-lo em Zod é troca de forma sem ganho de garantia, e o teto de prompt que importava passou a ser aplicado também dentro do cliente único.
- [x] 3.3 Falha deixa de virar 200: a ativação de notas do Anki não engole mais o erro num `ativadas: 0` (que era indistinguível de "não havia o que ativar") e responde com `code: 'ativacao_falhou'`; o áudio anterior que não pôde ser removido vira aviso na resposta em vez de `{ok:true}` silencioso com o byte ocupando disco.
- [x] 3.4 `erroDeRota` loga `warn` em 4xx e `error` em 5xx, e as 50 chamadas passaram a declarar o status. Tudo virava `error`, inclusive corpo malformado — e um diário cuja entrada mais comum é "alguém mandou JSON inválido" é um diário que se aprende a ignorar.

## 4. Uma implementação por utilitário

- [x] 4.1 `src/core/texto/idioma.ts` (`baseLang`) e `src/core/texto/palavra.ts` (`chaveDaPalavra`). Eram quatro cópias de `baseLang` — uma delas já divergente, porque a do YouTube tira o prefixo `a.` das legendas automáticas — e duas cópias byte a byte da chave comparável, com nomes diferentes (`chaveDaPalavra`/`chaveComparavel`), que é pior que duplicata anônima: quem lê um arquivo não tem motivo para procurar o outro. As cinco `chaveDedup` COM idioma ficam para `modo-anonimo-em-paridade`: elas discordam entre si (uma inverte os campos) e mexem em dado gravado.
- [ ] 4.2 `server/lib/{meta,armazenamentoDir,pathSeguro}.ts`. **Não feito:** `armazenamentoDir` e o guarda de path traversal são tocados por `schema-sem-tabela-orfa` e pela decisão de S3; a leitura de `meta` aparece em rotas que `arranque-leve-e-payloads-enxutos` vai revisar inteiras.
- [ ] 4.3 `stopwords` única e `FiltroPersistido`. **Não feito:** as listas de `keywords.ts` e `quality.ts` viraram POR IDIOMA em `idioma-alvo-e-ui-respeitados` e hoje respondem perguntas diferentes (o que não vira cartão × o que não é palavra de conteúdo); fundi-las agora apagaria essa distinção.

## 5. Legado

- [x] 5.1 `POST /api/exercises/results`, `saveExerciseResult` e `exerciseResultSchema` removidos. Era o gravador POR ITEM, anterior a `/rodada`, e sobrevivia roteado só para o Estudo: schema próprio sem `cardId`, sem `roundId` para agrupar, e as métricas liam as duas formas do mesmo dado. O Estudo passou a gravar por `/rodada`, como os nove jogos. `tests/pontuacao.test.ts` — que protege o teto de pontuação — passou a apontar para `rodadaSchema`.
- [x] 5.2 `migrarLeitnerParaFsrs` com `box > 1` na CONSULTA e teto de 5.000 por boot. Ela lia toda linha sem estado FSRS a cada boot, o que inclui permanentemente as cartas novas (que nunca migram, por desenho) — a mesma leitura repetida por processo, a cada restart, para migrar zero. **Desvio:** a proposta pedia uma "marca de já migrado"; a marca seria estado novo para uma migração que termina sozinha. O teto resolve o problema real (o boot não fica refém do tamanho do acervo) sem inventar tabela.
- [x] 5.3 `npm test` verde (2.855, 4 novos); typecheck, typecheck:core, lint, build, ast-grep, i18n (órfãs, pseudo, cobertura, piso), audit:gate, workflows, e2e 18/18. **Nota:** o teste de inventário de configuração criado na change anterior pegou este trabalho — `LLM_RESERVA_*` mudou para `provedores.ts` numa forma que o scanner não conhecia (`const { A } = process.env`), e ele acusou "declarada e nunca lida". Era o ponto cego do teste, não o inventário mentindo; o scanner aprendeu a quarta forma.
