# Security Policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Use GitHub's private vulnerability reporting: **Security → Report a vulnerability** on this
repository. You will get an acknowledgement within 72 hours and a fix or a written assessment
within 14 days for confirmed issues.

## Scope

- The web app (`src/`), the API server (`server/`, `server.ts`) and the build/deploy files.
- Multi-tenant isolation, authentication (Supabase JWT), rate limiting, input validation,
  SSRF protection on imports, and the no-account mode (which must never send data to `/api`).

## Out of scope

- Vulnerabilities in third-party models or in the Hugging Face Hub.
- Self-hosted deployments that disable `AUTH_REQUIRED` — that mode is single-user by design.

## What is already in place

CI runs SAST (Semgrep), a dependency audit with a named allowlist, secret scanning, Zod
validation coverage checks and a JWT attack-vector probe. The methodology is described in
`docs/metodologia-de-auditoria.md`.
