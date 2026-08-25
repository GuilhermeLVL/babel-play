# Babel Play

**Learn a language from what you already watch, play and talk about.** Live transcription and
translation of any audio on your computer — running **inside your browser** — turned into
vocabulary games and spaced repetition.

[Português](README.pt-BR.md) · [Try it without an account](#try-it) · [How it works](#how-it-works) · [What doesn't work yet](#what-doesnt-work-yet)

<!-- demo: replace with the 15 s GIF (live captions with the Network tab empty) once the public URL exists -->
> Demo: `https://<domain>` — coming with the public deploy. Until then: run it locally in 3 commands below.

![CI](https://github.com/GuilhermeLVL/babel-play/actions/workflows/ci.yml/badge.svg)
![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)

## Try it

```bash
npm install          # also copies the ONNX Runtime / Silero VAD binaries into public/
cp .env.example .env # set PORT; no API key is needed for the local pipeline
npm run dev          # → http://localhost:<PORT>   (open via localhost: secure context for the models)
```

Choose **Continue without an account**: the whole pipeline runs locally and **not a single
request** reaches the server — that is measured, not promised (see benchmarks).

## What it does

- **Capture** a browser tab, the system audio (Windows loopback, no setup) or the microphone.
- **Transcribe** with Whisper in the browser (WebGPU, WASM fallback) — English on `whisper-tiny`,
  other languages on a larger model; a *private* profile never touches the cloud.
- **Translate** with Opus-MT locally, the Chrome Translator API, or a cloud LLM when you are
  signed in and on a paid plan — always with a fallback chain, never an empty caption.
- **Learn**: every word you heard can become a card; nine short games and FSRS-5 spaced
  repetition work on *your* vocabulary, with a CEFR track (real word lists, never guessed levels).
- **Accounts are optional**: without one, data lives in IndexedDB; sign up later and it migrates
  once, idempotently.

## How it works

```
mic / tab / system audio ─► VAD (Silero, worklet) ─► Whisper (transformers.js · WebGPU|WASM)
        │                                                     │
        └─► live captions overlay  ◄── Opus-MT | Chrome Translator API | cloud LLM (plan-gated)
                                                              │
                     vocabulary ─► games ─► FSRS-5 review ─► metrics (with confidence)
```

- **One HTTP funnel.** Every call to the API goes through `src/data/api.ts#apiFetch`. Without an
  account, that funnel answers from an in-memory server over IndexedDB
  (`src/data/efemero/`), with the same response shapes as the real server — so the UI does not
  know which one it is talking to. An ast-grep rule forbids `fetch('/api/…')` anywhere else.
- **Three independent axes**: identity (anonymous · account · self-host), plan (decided only by
  the server), role (user · admin · support).
- **Server**: Express + Drizzle on libsql/SQLite (Turso-ready), Supabase JWT (JWKS), per-user
  isolation in every repository, rate limits, Zod at every boundary, SSRF guard on imports.

More in [docs/arquitetura.md](docs/arquitetura.md).

## Compatibility

| | |
|---|---|
| WebGPU | Chrome/Edge 113+, Safari 18+; Firefox falls back to WASM (slower, works) |
| First load | ~40–80 MB of model weights from the Hugging Face Hub, cached by the browser |
| System audio | Windows loopback via the local server (self-host) or tab/screen share anywhere |
| WASM threads | need cross-origin isolation (`CROSS_ORIGIN_ISOLATION=1`); single-thread otherwise |

## Measured, not claimed

Everything below comes from scripts in the repo; numbers are from a 2026-08 run.

- **No-account mode: 0 requests to `/api`** across the full flow (probe with a counting `fetch`).
- **Contrast**: 0 nodes below WCAG AA across 14 theme/scheme/profile combinations; 0 targets
  under 24 px (axe-core + DOM measurement).
- **Capacity** (one process, 4-CPU cpuset, write-heavy load): ~300 req/s; adding cluster
  workers *reduces* throughput because SQLite has a single writer — scaling means changing
  the database, not adding processes.
- **Auth**: 7 forged-token vectors (alg:none, algorithm confusion, wrong iss/aud, expiry…)
  rejected by the real verifier, and a positive control accepted.
- 1,850+ automated tests; typecheck, lint, build and a dependency audit with a named allowlist
  on every push.

## What doesn't work yet

- Opus-MT int8/fp16 fails to build a session on some devices (ONNX Runtime `qdq_actions`);
  the app falls back to the next translator, which may be unavailable without an account.
- Screen-share audio on Windows can raise `NotReadableError`; use tab share or the loopback route.
- Game rounds played without an account are not migrated to the account (only sessions,
  audio and cards are).
- Single-writer database: fine for a beta, not for scale.
- No billing yet — plans are set by an admin.

## Verify

```bash
npm run typecheck && npm run typecheck:core && npm run lint && npm test && npm run build
```

## Docs

[Architecture](docs/arquitetura.md) · [Deploy](docs/deploy.md) · [Regression checklist](docs/testes-regressao.md) · [Launch plan](docs/lancamento-2026-09.md)

## Contributing · Security · License

[CONTRIBUTING.md](CONTRIBUTING.md) · [SECURITY.md](SECURITY.md) · [MIT](LICENSE)
