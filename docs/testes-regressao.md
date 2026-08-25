# Roteiro de testes e regressão

> Como validar a aplicação de ponta a ponta. Executado por completo em 2026-07-24 (baseline + pós-correções). Automatizável via MCP chrome-devtools (`evaluate_script`) ou manualmente.

## 0. Pré-requisitos

- `npm run dev` (porta definida em `.env` → **3100**; abrir SEMPRE por `http://localhost:3100`).
- `GET /api/health` → `{"status":"ok","db":"up"}`.

## 1. Suíte estática (roda em ~1 min)

| Comando | O que cobre | Estado 2026-07-24 |
|---|---|---|
| `npm run typecheck` | Tipos de todo o app | ✅ |
| `npm test` | Engine de exercícios (normalização, similaridade, progressão, elegibilidade) | ✅ |
| `tsx verify-backend.ts` / `verify-data.ts` / `verify-gateway.ts` | Contratos do backend/gateway | (rodar sob demanda) |

## 2. Smoke de navegação

Clicar Início → Biblioteca → Conteúdo da Sessão → Meu Vocabulário → Capturar; nenhuma exceção no console. ✅

## 3. Pipeline de captura (sem hardware)

No console da tela **Capturar**:

```js
await window.__simSystem()        // injeta JFK.wav no pipeline VAD→STT→MT
await window.__simBench(6, 6)     // benchmark decode/tradução em regime
```

Esperado: balão "Sistema / Outros" com transcrição + tradução; decode ~470ms p/ 6s de áudio (WebGPU). ✅

## 4. Captura do sistema via SERVIDOR (rota nova, zero fricção)

1. `GET /api/audio/loopback/support` → `supported: true` (Windows).
2. Capturar → ajustar → fonte **"Computador (servidor) ★"** → "Testar captura" com algo tocando → veredito ✓ com pico > 0.
3. Iniciar Gravação e tocar áudio com fala (ex.: `new Audio('https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/jfk.wav').play()`).
4. Esperado: legendas ao vivo do áudio do sistema, sem popup de compartilhamento. ✅ (validado 2×)

## 5. Regressão do cold-start (fala nunca se perde)

1. Recarregar a página (worker do modelo zera), iniciar gravação e tocar fala IMEDIATAMENTE.
2. Esperado no console: `trecho N GUARDADO p/ transcrever depois` → `modelos locais prontos ✓` → `transcrevendo N trecho(s) guardado(s)` → decode final com texto. ✅
3. Anti-regressão: se voltar a aparecer `descartado` sem `GUARDADO`, o buffer quebrou.

## 6. Importação

- `POST /api/import/web` `{url}` → título+texto (✅ example.com).
- `POST /api/import/document` binário + header `x-filename` → texto (✅ .txt).
- YouTube: requer `yt-dlp` (instalado nesta máquina via winget; caminho em `YTDLP_PATH` no `.env`).

## 7. iChat

Enviar mensagem em qualquer tela → resposta via cascata Groq→Gemini→Ollama citando o CONTEXTO real da tela (ex.: transcrição ao vivo, métricas). ✅ (com `GROQ_API_KEY`)

## Achados conhecidos (não regressões)

- Tradução local: nesta máquina o opus-mt não cria sessão ONNX e o Chrome (for Testing) não tem a Translator API → o motor efetivo é **MyMemory** (rede, ~5k chars/dia). Registrado no roadmap.
- Cold-start REAL do Whisper (1º uso, sem cache): download ~33MB + compilação de shaders ≈ 1–1,5 min. Mitigado por: barra agregada + fala bufferizada + pré-download no onboarding.
- Modal "Parar & Salvar" não tem opção explícita de DESCARTAR a sessão (Esc volta a gravar) — melhoria futura.
