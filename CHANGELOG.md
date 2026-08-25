# Changelog

All notable changes are listed here. Versions follow semver; dates are ISO.

## [Unreleased]

## [0.1.0] — 2026-08-25

First public release.

- Live capture (browser tab, system audio, microphone) with transcription and translation in
  the browser — Whisper via WebGPU/WASM, Opus-MT, Chrome Translator API — with fallbacks.
- Vocabulary from what you heard → games and spaced repetition (FSRS-5), CEFR track.
- No-account mode: the full local pipeline with **zero requests** to the server; data lives in
  IndexedDB and migrates to an account, once, when you sign up.
- Accounts (Supabase JWT), per-user isolation, plans decided server-side, usage quotas.
- Quality tooling: ASVS 5.0 traceability, JWT attack probe, capacity matrix, UX regression gate.
