# Spike S7: Worker de sonda (Hyperdrive → Supabase São Paulo)

Descartável, fora do bundle do app e do `tsconfig` raiz. Resultados em `resultados/` e análise em
`docs/auditoria/2026-10-19-spikes-cloudflare.md` (seção S7).

## Rotas

- `/select1`: 25 `select 1` seguidos num `pg.Client` via `env.HYPERDRIVE` (p50/p95, conexão, colo).
- `/rota7`: 7 consultas típicas (`users`, `sessions`, `vocab_cards`, `flags`, `utterances`…).
- `/trava`: duas transações concorrentes com `pg_advisory_xact_lock` e com `select … for update`.
- `/rede`: RTT TCP + `SSLRequest` do Postgres do Worker até o pooler e o host direto (sem credencial).
- `/runtime`: `process.env`, `scryptSync`, `zstdDecompressSync`, `navigator.userAgent`, `httpServerHandler`.
- `/express/api/health`: Express 4 via `httpServerHandler` (`/express/API/health` deve dar 404).

As três primeiras exigem o binding `HYPERDRIVE`, que ficou comentado em `wrangler.jsonc`: em
2026-10-19 nenhum dos dois tokens tinha permissão para subir a CA da Supabase
(`wrangler cert upload certificate-authority` → `Authentication error [code: 10000]`), e
`verify-full` exige `--ca-certificate-id`.

## Como repetir

```bash
# dentro deste diretório; segredos vêm do .env da raiz, nunca de arquivo versionado
npm i iconv-lite@0.7.0 --no-save --no-package-lock --prefix .   # só para /express
npx wrangler types -c wrangler.jsonc                             # tipos (worker-configuration.d.ts, ignorado)
npx wrangler deploy -c wrangler.jsonc
curl https://spike-s7.<subdominio>.workers.dev/runtime
npx wrangler delete -c wrangler.jsonc --force                    # sempre com -c: na raiz o wrangler acha o projeto Pages
```

Com o token certo: `wrangler cert upload certificate-authority --ca-cert data/supabase-ca.crt --name supabase-2021`,
`wrangler hyperdrive create babel-sp … --ca-certificate-id <id> --sslmode verify-full --caching-disabled`,
descomentar o binding e chamar `/select1`, `/rota7` e `/trava`.
