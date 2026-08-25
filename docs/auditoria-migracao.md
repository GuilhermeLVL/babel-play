# Auditoria & Matriz de Migração — Babel Play Desktop → Web

> Relatório da auditoria que fundamenta a migração. Fontes: leitura direta de `../Tradutor` (Electron,
> funcional) e `../babel-play` (protótipo web). Complemento de viabilidade em
> [viabilidade-web-inferencia.md](viabilidade-web-inferencia.md).

## 1. O produto

**Babel Play** — plataforma de **captura → tradução → estudo/prática** de idiomas. Nasceu como copiloto de
voz em tempo real para jogos e **pivotou** para uma plataforma geral de aprendizado com **perfis adaptativos**
(Estudo, Jogos, Entretenimento). "Estudo" (só a fala do próprio usuário) é a trilha limpa e entra primeiro;
Jogos/Entretenimento têm blockers legais no desktop — e, na web, blockers técnicos (ver §5).

Núcleo de valor: capturar áudio/tela → perceber (VAD→STT→diarização→LID) → traduzir → assistir (sugestões de
resposta, TTS) → lembrar (memória cifrada + RAG) → **estudar** (a fala real vira flashcards/SRS e exercícios).

## 2. Desktop (Electron) — o "motor" funcional

**Stack:** Electron 33 + electron-vite; renderer em **TypeScript puro** (sem framework); empacotamento
electron-builder (Windows NSIS). Arquitetura de **7 processos** para escapar de limitações de addon nativo:
main, renderer (janela + overlay), preload, **sidecar de inferência** (utilityProcess: ONNX/transformers.js/
sherpa), **helper de loopback** (node.exe puro — audify/WASAPI quebra dentro do Electron), **whisper-server.exe**.

**Pipeline central (o que precisamos re-implementar):**
- **Captura** — 2 trilhas normalizadas a 16 kHz mono PCM: **sistema (loopback)** via `audify`/WASAPI num
  helper Node; **microfone** no renderer via `getUserMedia` + `AudioWorklet` (downsampler).
- **VAD** — **Silero VAD v5** (onnxruntime-node) em blocos de 512 amostras; degrada para energia/RMS.
- **STT** — **whisper.cpp `whisper-server.exe`** como servidor HTTP local (`/inference`, `verbose_json`);
  `ggml-base.bin`. Streaming é sintetizado pelo app (segmenter com pre-roll/hangover, partials a cada ~700 ms
  numa janela deslizante de ~9 s, buffer LocalAgreement p/ prefixo estável). Alternativas: faster-whisper
  (Python) e STT nuvem (Groq `whisper-large-v3-turbo`), roteado por confiança/budget.
- **Tradução** — **transformers.js** local (M2M-100 default, NLLB, Opus-MT) no sidecar **+** nuvem
  (Anthropic/OpenAI-compat/Groq). Roteador decide passthrough/local/nuvem por confiança, LID, par de idiomas,
  glossário; cache LRU; budget-gate; `NegativeRouteCache`.
- **TTS** — **Piper** (sherpa-onnx) + **Windows SAPI**; modos user-only vs virtual-mic; supressão anti-auto-STT.
- **Memória** — JSONL **cifrado (AES-256-GCM)** com embeddings inline (`e5-small`), busca cosseno (RAG).
- **Visão** — `desktopCapturer` → OCR (Windows OCR/Tesseract) → VLM (Ollama local / nuvem).
- **Extras** — overlay transparente click-through, hotkeys globais, reply-assistant agêntico, orquestrador
  (grafo de estado TS bespoke), suíte de **learning/FSRS** e **reading**, gestão de modelos (HF download).

**Padrões de qualidade a preservar (quase todos TS puro, portáveis):** pipeline com fast-path (legenda não
espera sugestão), fila STT serial + single-flight de partials com backpressure, VAD gating, buffers limitados,
**harness de resiliência** (`withTimeout`/`withRetry`/`CircuitBreaker`), cache LRU com versão de glossário,
budget guards que degradam (nunca silenciam), config store reativo, honestidade de métricas como tipo.

**Já é provider-agnóstico:** todo LLM passa por `ProviderConfig { type, baseUrl, model, apiKeyRef }` e cada
capacidade se liga a um provider por id, com robustez central em `src/main/llm/llmClient.ts`. Isto é a semente
do **AI Gateway** web.

## 3. Protótipo web (`babel-play`) — a casca nova

**Stack:** React 19 + Vite 6 + Tailwind v4 + TS; app do **Google AI Studio** com backend **Express + Gemini**
(`server.ts`); troca de telas custom (sem react-router); estado em `useState` no `App.tsx` + `localStorage`.

**Design "Instrumento":** papel quente (`--canvas #E6E2D6`), tinta `#26241F`, **acento laranja `#F04E23`**,
indigo `#5B5EA6` (IA); dark "Observatório"; fontes Archivo/Inter/IBM Plex Mono; sombras táteis. **Preservar.**

**8 telas** (`src/components/views/`): Hub, LiveCapture, Library, Analysis (sub-tabs transcript/reading/study),
Study, Reading, Metrics, Settings + exercícios (EdDrill, VocabDrill, ScenarioRoleplay) + **iChat** (assistente
onipresente) + sistema de **layout editável** (drag-resize/hide) real.

**O que já funciona de verdade:** chat Gemini (`/api/gemini/chat`), tradução **MyMemory**, **Web Speech**
(STT), **MediaRecorder**/`getUserMedia`, `speechSynthesis` (TTS), **SRS FSRS/Leitner**, engine de diff/
exercícios (com testes em `test.ts`), layout, dark mode.

**O que é mock (a substituir):** `src/data/mockData.ts` (4 sessões + 10 cards seed); `server.ts:37-88`
(simulador de fallback por keyword); LiveCapture `VISION_TEMPLATES` (OCR fake), `simulatedUpcomingBlocks`
(falas fabricadas por `setTimeout` em 9 s/18 s), chatbot por keyword; Analysis `getStudyTextsForRecording`
(transcrições hardcoded), player simulado, nota por `Math.random()`; Study XP hardcoded; Metrics/Hub números
hardcoded; Settings toggles inertes; Memory Vault/RAG mock. Obs.: `server.ts` usa `model: "gemini-3.5-flash"`
(id provavelmente incorreto) — vira config por Perfil.

## 4. Matriz de migração (capacidade → mecanismo local → veredito web → abordagem)

Legenda: ✅ portável · 🔧 adaptar · ☁️ precisa backend · ⛔ impossível no navegador.

| Capacidade | Local (desktop) | Veredito | Abordagem web |
|---|---|---|---|
| Captura mic | getUserMedia + AudioWorklet | ✅ | Igual (já web-nativo) |
| Loopback de sistema | audify/WASAPI (helper Node) | ⛔/🔧 | Sem equivalente; parcial via `getDisplayMedia({audio:true})` (aba/sistema) |
| VAD | Silero (onnxruntime-node) | 🔧 | `@ricky0123/vad-web` (Silero/onnxruntime-web) |
| STT | whisper.cpp (server local) | 🔧/☁️ | Web Speech (Chrome/Edge) → Transformers.js Whisper WebGPU → Groq (nuvem) |
| Diarização | sherpa-onnx CAM++ | 🔧/☁️ | sherpa-wasm (pesado) / backend / heurística (mic=eu, aba=eles) |
| Tradução | transformers.js + nuvem | ✅/🔧 | Chrome Translator API → MyMemory → Transformers.js (WASM) / LLM nuvem |
| TTS | Piper + SAPI | 🔧+⛔ | `speechSynthesis` / Piper-WASM / nuvem. Virtual-mic = ⛔ |
| Embeddings/memória | e5 + JSONL cifrado | 🔧/☁️ | Transformers.js + IndexedDB/OPFS (+WebCrypto); escala → pgvector/Supabase |
| Orquestração/roteamento | TS no main | 🔧 | TS puro portável → Web Worker / backend; lógica reusada verbatim |
| Reply/LLM/VLM | llmClient + broker | ☁️ | Backend proxy (chave) para Gemini/HF; direto p/ OpenAI/Anthropic/Groq |
| Visão — captura | Windows Graphics Capture | 🔧 | `getDisplayMedia` (gesto por sessão) |
| Visão — OCR | Windows OCR/Tesseract | ✅ | Tesseract.js (traineddata via CDN/OPFS) |
| Overlay sobre jogo | Electron always-on-top | ⛔ | Sem overlay OS; painel in-page / extensão / Document PiP |
| Hotkeys globais | globalShortcut | ⛔ | Só atalhos in-page com foco |
| Storage de modelos | userData filesystem | 🔧/☁️ | Cache API/OPFS p/ transformers.js; GGUF grande → backend |
| SRS/FSRS + exercícios | TS puro `shared/learning` | ✅ | **Totalmente portável**; persistir em SQLite/IndexedDB |
| Reading | TS puro `shared/reading` | ✅/🔧 | Timing porta como está; narração via Web Speech/nuvem |
| Config/segredos | electron-store + safeStorage | 🔧 | SQLite (tabela `secrets` cifrada) / IndexedDB |

## 5. Blockers duros (impossíveis em navegador puro)

1. **Loopback de áudio do sistema** — sem WASAPI no browser (`getDisplayMedia` é o parcial).
2. **Overlay OS always-on-top** sobre outros apps.
3. **Hotkeys globais de SO** (só in-page com foco).
4. **Injeção de micro virtual** (TTS→jogo).

Tudo que é "gaming" depende destes 4. Por isso o **perfil Estudo/Reunião** (mic próprio + conteúdo web +
prática) é o MVP natural da web — e o protótipo `babel-play` **já reenquadrou** o overlay como painel in-page e
o LiveCapture como copiloto de reunião/estudo. Registrado na change `web-scope-boundaries`.

## 6. Mapa de reúso

- **Lift as-is** (TS puro) → `src/core/`: `shared/learning/{scheduler(FSRS-5),cloze,cefrEstimate,fsrsOptimize}`,
  contratos (`learning/translation/memory/perception`), `memory/retrieval` (cosseno/RAG),
  `reading/{narration,immersionPlayer,audiobookSync}`, `orchestration/{boundedQueue,harness}`,
  `providers/capabilities`.
- **Lift com adaptação** → `src/gateway/adapters/*`: `main/llm/llmClient.ts`,
  `main/translation/{router,providers/*}`, `shared/config/{schema,presets}` (aparar knobs de overlay/hotkey/
  loopback → viram `Profile`/`CapabilityBinding`). Anthropic-SDK e adapters com segredo compilam **só no server**.
- **Substituir**: `onnxruntime-node`→`onnxruntime-web`/Transformers.js; `fs`/`safeStorage`→SQLite/IndexedDB;
  IPC→HTTP/SSE.
- **Não lift**: `audio/systemCapture`, `overlay/*`, `tts/sapiSynth`, `perception/whisperServer`, `models/*` nativos.

## 7. Recomendação de arquitetura (síntese)

Web = **Transformers.js (WebGPU) para VAD/STT/MT/embeddings/OCR opcional** + **backend fino** (chaves, proxy
Gemini/HF, STT/LLM/TTS/VLM de nuvem, vetores no futuro) + **SQLite/Drizzle** (→ Supabase) + **IndexedDB/OPFS**.
Tudo orquestrado por um **AI Gateway provider-agnóstico** com **Perfis** (cadeias de fallback por capacidade),
herdando a robustez do desktop (breaker/retry/budget/consentimento). Gaming (overlay/hotkeys/loopback/
virtual-mic) fica fora do escopo web.
