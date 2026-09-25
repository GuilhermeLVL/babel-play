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
- Release tooling: `npm run release -- patch|minor|major` bumps `package.json`/lock, dates this
  section and prints (does not run) the tag commands. Policy in `docs/versionamento.md`.
- API compatibility gate: `tests/contratos/api-contrato.json` lists every `/api` route; a route may
  only disappear two minor versions after entering `api-depreciacoes.json`.
- Expand/contract gate for migrations (`scripts/migracoes/conferir.mjs`, CI job `migracoes`):
  destructive SQL needs `-- CONTRATO:` and its own diff; every new migration needs `REVERSAO:`.
- Staging → production deploy flow: production only from a commit with a green staging smoke
  (`deploy/staging` status), pre-deploy volume snapshot, smoke on `/api/ready` + `/api/health.versao`,
  automatic rollback to the previous image when the smoke fails.
- CI: light load job (autocannon, p95 < 500 ms, zero errors), Trivy image scan (fails on fixable
  HIGH/CRITICAL) and a CycloneDX SBOM; manual `restauracao-drill.yml` restores the latest production
  backup (daily snapshot + Litestream) and checks integrity and counts.

### Fixed

- `rank.combo` declared `DEFAULT 0` in `schema.ts`, matching the database since migration 0027;
  the missing drizzle snapshot for 0030 was generated, so `drizzle-kit generate` no longer proposes a
  bogus migration.

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
