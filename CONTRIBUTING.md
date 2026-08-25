# Contributing

Thanks for taking a look. This project is built in public by one person; small, focused
contributions are the ones most likely to land.

## Run it locally

```bash
npm install            # also copies the ONNX Runtime / VAD binaries into public/
cp .env.example .env   # PORT and optional keys; no key is required for the local pipeline
npm run dev            # Express + Vite in one process → http://localhost:<PORT>
```

Open it through `localhost` (secure context) — the models load in the browser.

## Before you open a PR

```bash
npm run typecheck && npm run typecheck:core && npm run lint && npm test && npm run build
```

All must be green. `npm test` runs ~1,850 tests against a temporary SQLite database; nothing
touches your `data/`.

## What kind of change is welcome

- Bugs with a reproduction (browser, WebGPU support, OS, model) — use the issue form.
- Accessibility and UX fixes backed by a measurement (contrast, target size, keyboard).
- New STT/MT adapters behind the existing gateway (`src/gateway/`), with a fallback path.
- Tests that fail before and pass after.

Things that need a discussion first (open an issue): new persistence, new external services,
anything that sends user data off the device by default.

## Conventions

- Commits: `tipo(escopo): resumo` — `feat`, `fix`, `docs`, `test`, `refactor`. Portuguese or
  English, both fine. Say **why**, not only what.
- No `fetch('/api/…')` outside `src/data/api.ts` — an ast-grep rule enforces the single funnel
  (it is what makes the no-account mode work).
- Honesty as a type: never fabricate a value the server does not know; show a skeleton instead.

## Code of conduct

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).
