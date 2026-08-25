# Estudo de Viabilidade — Inferência de IA na Web (2026)

> Viabilidade de rodar as capacidades de IA na web de forma **provider-agnóstica e free-first**, permitindo
> defaults gratuitos/nativos, a **IA local do usuário** e **BYO-key** de nuvem. Pesquisa verificada em jul/2026
> (Chrome estável v150). Complementa [auditoria-migracao.md](auditoria-migracao.md).

## Sumário executivo

- **Chrome built-in AI (Gemini Nano on-device)** está estável em 2026 para **Translator, Language Detector e
  Summarizer** (Chrome 138+) e o **Prompt API** de texto — mas **só Chrome/Edge desktop**, com gate de hardware
  (~22 GB disco, 4 GB VRAM ou 16 GB RAM) e **entrada multimodal ainda atrás de flag**. Não dá para exigir de um
  usuário qualquer → é um **bônus com feature-detection**, nunca a base única.
- **Transformers.js v4 + WebGPU** torna **Whisper quase em tempo real no navegador** viável (tiny 10–15× RT,
  base 5–8× RT, small 2–4× RT) — a melhor história "grátis/local" de STT. Cuidado: encoder deve ficar fp32
  (q8 degrada); **NLLB no WebGPU quebra (bug aberto) → usar WASM**.
- **CORS (contraintuitivo):** **OpenAI, Anthropic e Groq permitem chamada direta do navegador** (flag
  `dangerouslyAllowBrowser` / header Anthropic) — proxy é opcional (só evita expor a chave). **Gemini e HF
  Inference Providers exigem proxy** (Gemini é "prototyping-only" client-side; HF tem CORS bloqueado).
- **IA local do usuário (Ollama/LM Studio) de um site HTTPS**: possível via `OLLAMA_ORIGINS`, mas o real bloqueio
  em 2026 é o **prompt de Local Network Access do Chrome 142+** ao acessar `localhost` (não é mixed-content).
  Requer UX explícita de onboarding.
- **RAG client-side** é viável p/ alguns milhares de itens (Transformers.js embeddings + `sqlite-vec`/OPFS ou
  cosseno em JS). Libs "turnkey" (`voy`, `client-vector-search`) têm manutenção fraca → preferir sqlite-vec/cosseno.

## Matriz por capacidade (resumo)

| Capac. | Tier 1 — Grátis/Navegador | Tier 2 — Local do usuário | Tier 3 — Nuvem BYO-key |
|---|---|---|---|
| **STT** | Web Speech API (Chrome/Edge; nuvem-Google por trás) · **Transformers.js Whisper WebGPU** (100% local) | whisper.cpp/faster-whisper local | **Groq whisper-large-v3-turbo** (free: ~2.000 req/dia, 7.200 s áudio/h) · OpenAI · Gemini |
| **Tradução** | **Chrome Translator API** (on-device, streaming) · **MyMemory** (CORS, sem chave; 5k/50k chars-dia) · Transformers.js M2M/NLLB (WASM) | LibreTranslate self-host · LLM local | LLM (Gemini/OpenAI/Anthropic) |
| **TTS** | `speechSynthesis` (vozes locais do SO) · Transformers.js TTS | Piper/Kokoro local | Gemini TTS · OpenAI TTS · ElevenLabs |
| **Embeddings** | Transformers.js `gte-small`/MiniLM + `sqlite-vec`/cosseno | Ollama `/embeddings` (nomic) | OpenAI `text-embedding-3` · Gemini (HF exige proxy) |
| **VAD** | **`@ricky0123/vad-web`** (Silero, mantido, v0.0.30) | — | — |
| **OCR** | **Tesseract.js** (100+ idiomas, cache IndexedDB) | Ollama vision (Qwen2.5-VL) | Gemini/GPT/Claude Vision |
| **VLM** | Transformers.js **Moondream2** (WebGPU) · Prompt API multimodal (atrás de flag) | Ollama (Qwen2.5-VL/llava/moondream) | Groq Llama-4 · Gemini/GPT/Claude Vision |
| **LLM** | **WebLLM** (WebGPU, ~80% nativo) · **wllama** (WASM) · Chrome Prompt API (Gemini Nano) | Ollama/LM Studio (`OLLAMA_ORIGINS`) | Anthropic/OpenAI/Groq (direto) · **Gemini/HF (proxy)** · OpenRouter (`:free`) |

## Stacks-padrão por Perfil

### Grátis/Web (sem chave; precisa funcionar para quem só abre a URL)
STT Web Speech → Transformers.js Whisper (WebGPU) · MT Chrome Translator API → MyMemory · TTS `speechSynthesis`
(voz local) · Embeddings Transformers.js `gte-small` + sqlite-vec · VAD `@ricky0123/vad-web` · OCR Tesseract.js ·
VLM Moondream2 (WebGPU) · LLM Chrome Prompt API → **WebLLM**/wllama. **Sem backend** além de hosting estático;
feature-detection em tudo (Chrome-desktop ≠ Firefox ≠ iOS Safari).

### Privado/Local (IA do próprio usuário)
STT whisper local · MT LibreTranslate/LLM local · TTS Piper local · Embeddings Ollama `/embeddings` +
sqlite-vec · VAD `@ricky0123/vad-web` · OCR Ollama-VLM/Tesseract.js · LLM Ollama/LM Studio (`OLLAMA_ORIGINS`
= origem exata do app, nunca `*`). **Onboarding "Conectar sua IA local"** que detecta `localhost:11434/1234`,
antecipa o prompt de Local Network Access do Chrome 142+ e dá instruções de `OLLAMA_ORIGINS` por SO.

### Qualidade/Nuvem (BYO-key)
STT Groq whisper-turbo · MT/LLM/VLM/TTS via provider escolhido. **OpenAI/Anthropic/Groq: direto** (flag);
**Gemini/HF: via proxy fino** (obrigatório). Chave BYO fica só no navegador (se direto) ou passa por request ao
proxy sem persistir no server.

## Riscos / gotchas (tratar como 1ª classe)

1. **On-device AI é só Chrome/Edge desktop** — Firefox/Safari sem equivalente (Mozilla contrária ao Prompt API).
   Fallback permanente, não "temporário".
2. **Local Network Access (Chrome 142+)** é o real bloqueio de `HTTPS→localhost` (Ollama/LM Studio). Se negado,
   falha silenciosa → UX explícita + escape hatch.
3. **Gemini Nano exige hardware** (~22 GB disco etc.) → indisponível para muitos; fallback WebLLM/Web Speech robusto.
4. **WebGPU necessário-mas-não-suficiente** — bugs de driver (NLLB-WebGPU quebra → WASM), encoder Whisper fp32,
   iOS < 26 sem WebGPU.
5. **APIs de Origin Trial mudam** (Writer/Rewriter/Proofreader expiraram no Chrome 148) → checar chromestatus antes de depender.
6. **CORS por-provedor** — Gemini/HF exigem proxy; OpenAI/Anthropic/Groq não. Errar isto = proxy inútil ou falha silenciosa.
7. **Tamanho de download de modelo** (Nano 2–4 GB, Whisper small 240 MB, NLLB 900 MB, WebLLM 1–4 GB) → UI de progresso + aviso Wi-Fi.
8. **iOS Safari é o elo fraco** — mesmo com WebGPU (26+), Web Speech e throttling divergem → QA e feature-set reduzido.
9. **Libs de vetor client-side pouco mantidas** (`voy`, `client-vector-search`) → preferir sqlite-vec/wa-sqlite/OPFS ou cosseno próprio.
10. **Deadlines de chave do Google** (chaves Gemini irrestritas rejeitadas a partir de jun/2026) → BYO-Gemini precisa lidar com restrição de referrer/IP.

## Fontes principais

Chrome built-in AI: developer.chrome.com/docs/ai/{built-in,prompt-api,translator-api,language-detection,summarizer-api},
developer.chrome.com/blog/local-network-access. Transformers.js/Whisper/WebGPU: huggingface.co/blog/transformersjs-v4,
github.com/huggingface/transformers.js/issues/1286 (NLLB WebGPU), huggingface.co/spaces/Xenova/realtime-whisper-webgpu.
Web Speech: MDN Web_Speech_API, caniuse.com/speech-recognition. VAD: github.com/ricky0123/vad. OCR: github.com/naptha/tesseract.js.
Ollama/WebLLM/wllama: github.com/ollama/ollama/issues/300, github.com/mlc-ai/web-llm, github.com/ngxson/wllama.
Tradução: github.com/LibreTranslate/LibreTranslate, mymemory.translated.net/doc/spec.php. Nuvem/CORS: console.groq.com/docs/rate-limits,
ai.google.dev/gemini-api/docs/aistudio-build-mode, simonwillison.net/2024/Aug/23/anthropic-dangerous-direct-browser-access,
huggingface.co/docs/inference-providers, openrouter.ai/docs. RAG: github.com/asg017/sqlite-vec, github.com/rhashimoto/wa-sqlite.
