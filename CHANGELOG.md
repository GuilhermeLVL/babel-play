# Changelog

All notable changes are listed here. Versions follow semver; dates are ISO.

## [Unreleased]

### Added

- App version (`package.json` version plus the short commit sha when known, e.g. `0.1.0+35bc2d6`)
  embedded in the client bundle and exposed by the server: `x-babel-versao` header on every `/api`
  response, `versao` field in `/api/health`, and shown on the About screen.
- "New version available" notice: when the server answers with a different version than the
  loaded bundle, a non-blocking toast offers "Update" (reload) — once per page load.
- Deploy gate: `deploy.yml` refuses to deploy a commit whose `ci.yml` run did not succeed; an
  emergency override (`pular_gate_ci`) requires a written justification and is recorded in the
  run summary.

### Fixed

- Unknown `/api/*` routes now answer `404` JSON (`code: "rota_inexistente"`) for any method,
  instead of the SPA's `index.html` with `200`.

## [0.1.0] — 2026-08-25

First public release.

- Live capture (browser tab, system audio, microphone) with transcription and translation in
  the browser — Whisper via WebGPU/WASM, Opus-MT, Chrome Translator API — with fallbacks.
- Vocabulary from what you heard → games and spaced repetition (FSRS-5), CEFR track.
- No-account mode: the full local pipeline with **zero requests** to the server; data lives in
  IndexedDB and migrates to an account, once, when you sign up.
- Accounts (Supabase JWT), per-user isolation, plans decided server-side, usage quotas.
- Quality tooling: ASVS 5.0 traceability, JWT attack probe, capacity matrix, UX regression gate.
