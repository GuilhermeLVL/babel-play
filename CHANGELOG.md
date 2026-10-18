# Changelog

All notable changes are listed here. Versions follow semver; dates are ISO.

## [Unreleased]

### Audit of 2026-10-17/18

- **Security:** closed a 2FA bypass caused by URL casing; `.docx`/PDF decompression-bomb guard;
  cloud AI only with a declared birth date (`idade_nao_informada`); the guardian's consent now checks
  the invite's e-mail; audit trail for admin actions; session ended when the account is deleted.
  Tests: `tests/seguranca` and `tests/caracterizacao/menores-lacunas-fechadas.test.ts`.
- **On-device translation:** Bergamot (Mozilla) translates X to English in 15 languages from a CDN
  (R2), with Opus-MT as fallback. It turns on only when the owner publishes the models
  (`docs/LANCAMENTO.md`, section 2, step 8).
- **Interpreter mode:** merged (face-to-face conversation with spoken translation; natural cloud voice
  on Premium behind the `voz_natural` flag).
- **Minors:** protected profile (no purchases, no offers) and the guardian-consent flow.
- **Trial:** ends after 14 days or at the usage allowance; end-of-trial warning at 80% and 100% of use.
  The per-account dollar cap on paid plans is built but off (`TETO_USD_MES_*`).
- **AI providers:** OpenRouter with zero data retention in the provider registry
  (`ops/ia-provedores.openrouter.json`); never Gemini.
- **Subtitle import:** `.srt`, `.vtt` and `.ass` read in the browser, with no transcription cost.
- **Dependencies:** safe Dependabot updates applied (including CI actions); major bumps and the local
  inference engine were left out on purpose.
- **Docs:** READMEs rewritten in the five languages, `docs/README.md` index, dated studies moved to
  `docs/pesquisa/`, `docs/historico/` and `docs/auditoria/`, `FONTES.md` moved to `docs/FONTES.md`.

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
