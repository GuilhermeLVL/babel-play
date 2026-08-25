# Estratégia de Reúso — absorver o valor, reexpressar web-native

> Como decidimos o que reaproveitar do desktop (`../Tradutor`) e do protótipo (`../babel-play`) e o que
> re-implementar. Princípio: **reaproveitar ao máximo o valor agnóstico de plataforma; re-implementar
> web-native todo mecanismo específico de desktop.** "Reaproveitar ao máximo" ≠ copiar arquivos — é não
> perder a inteligência conquistada, expressando-a de forma idiomática para a web. Governado por
> [`web-foundations`](../openspec/changes/web-foundations/proposal.md).

## Como cada coisa é triada

### 1. Reusar VERBATIM — valor 100% agnóstico (as joias)
Matemática/algoritmos/padrões que valem em qualquer plataforma. Lift direto para `src/core`.

| Item | Fonte no desktop |
|---|---|
| FSRS-5, cloze, CEFR | `shared/learning/{scheduler,cloze,cefrEstimate,fsrsOptimize}.ts` |
| Timing de leitura/imersão | `shared/reading/{narration,immersionPlayer,audiobookSync}.ts` |
| *Forma* da abstração de provider (capability→adapter) | `main/llm/llmClient.ts` |
| Resiliência (breaker/retry/timeout) | `main/orchestration/harness.ts` |
| Algoritmos do pipeline (segmentação VAD, prefixo estável, roteamento por confiança, cache com versão de glossário) | `main/perception/*`, `main/translation/{router,cache}.ts` |
| Honestidade de métricas como tipo; prompts; glossários | `shared/**`, `main/translation/providers/prompt.ts` |

### 2. ABSORVER a intenção, RE-IMPLEMENTAR web-native
O *porquê* se mantém; o *como* muda porque o mecanismo era local-shaped.

| Desktop (mecanismo local) | Web-native (mesma intenção) |
|---|---|
| 7 processos / sidecar (fugir de limites do Electron) | **Web Workers / AudioWorklet / OffscreenCanvas** — compute off-main-thread |
| `whisper-server.exe` + sintetizar streaming de STT batch | **Web Speech** dá partials nativos; a lógica de segmentação/LocalAgreement só entra no caminho **Whisper-WASM** |
| JSONL cifrado + `safeStorage` + scan linear de vetores | **IndexedDB/OPFS + WebCrypto + sqlite-vec** (mesmo modelo de dados e RAG) |
| `electron-store` reativo | **React Query** (estado de servidor) **+ Zustand** (estado de cliente) |
| Orquestrador com checkpoint em disco/resume | **Princípio fast-path** via Workers + streaming (sem runner de grafo em disco) |
| `desktopCapturer` (visão) | `getDisplayMedia` (gesto por sessão) |

### 3. NÃO portar — seria anti-padrão / impossível no navegador
Registrado em [`web-scope-boundaries`](../openspec/changes/web-scope-boundaries/proposal.md).

Loopback WASAPI · overlay OS always-on-top · hotkeys globais · injeção de micro virtual · downloaders/binários nativos.

### 4. ADICIONAR porque a web exige (o desktop, single-user local, nunca precisou)
Onde se ganha "não quebrar / não vulnerável / não lento". Governado por [`web-foundations`](../openspec/changes/web-foundations/proposal.md).

- **Performance:** code-splitting por rota; lazy-load de modelos (Cache API/OPFS) + progresso; orçamento de latência por perfil; Lighthouse.
- **Segurança:** chave só no server (proxy); **sanitização de saída** (anti-XSS) do markdown de IA/usuário; **anti-SSRF** no proxy de `baseUrl` custom; CORS estrito + CSP; rate-limit; segredo cifrado em repouso; pronto p/ auth/RLS.
- **Dados isomórficos:** `repositories` com adapter de **cliente (IndexedDB/OPFS)** e **servidor (SQLite→Postgres)** por perfil — free/privado serverless e **offline-first**.
- **Entrega progressiva:** PWA instalável/offline (perfil local); responsivo; acessível (WCAG AA).

## Parâmetro de sucesso

A web deve funcionar **tão bem — ou melhor** — que o desktop: latência comparável (Web Speech ≈ desktop; Groq < desktop), UI nunca travando (Workers), e vantagens que o desktop não tinha (offline-first no navegador, multiplataforma, sem instalação). Se um padrão do desktop não servir a isso, ele **não** é portado — é repensado.
