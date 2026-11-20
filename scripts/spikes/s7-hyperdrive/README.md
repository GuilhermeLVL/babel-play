# Spike S7: Worker de sonda (Hyperdrive → Supabase São Paulo)

Descartável, fora do bundle do app e do `tsconfig` raiz. Resultados em `resultados/` e análise em
`docs/auditoria/2026-10-19-spikes-cloudflare.md` (seção S7).

## Rotas

- `/select1`: 25 `select 1` seguidos num `pg.Client` via `env.HYPERDRIVE` (p50/p95, conexão, colo).
- `/rota7`: 7 consultas típicas (`users`, `sessions`, `vocab_cards`, `flags`, `utterances`…).
- `/trava`: duas transações concorrentes com `pg_advisory_xact_lock`, `select … for update` e upsert `on conflict … do update`.
- `/rede`: RTT TCP + `SSLRequest` do Postgres do Worker até o pooler e o host direto (sem credencial).
- `/runtime`: `process.env`, `scryptSync`, `zstdDecompressSync`, `navigator.userAgent`, `httpServerHandler`.
- `/express/api/health`: Express 4 via `httpServerHandler` (`/express/API/health` deve dar 404).
- `/lock_timeout`: `lock_timeout`/`statement_timeout` que chegam pelo Hyperdrive, com `SET` e `SET LOCAL`.

As rotas de banco usam o binding `HYPERDRIVE` = config de produção `babel-sp`
(`731fd033ab814021963c4faea04fdd20`, origem direta IPv6, `verify-full` com a CA `supabase-2021`
`011bac50-d7ab-4034-b878-ff0a5d5c3cf5`, cache desligado). Não apague a config nem a CA.

## Como repetir

```bash
# dentro deste diretório; segredos vêm do .env da raiz, nunca de arquivo versionado
npm i iconv-lite@0.7.0 --no-save --no-package-lock --prefix .   # só para /express
npx wrangler types -c wrangler.jsonc                             # tipos (worker-configuration.d.ts, ignorado)
npx wrangler deploy -c wrangler.jsonc
curl https://spike-s7.<subdominio>.workers.dev/runtime
npx wrangler delete -c wrangler.jsonc --force                    # sempre com -c: na raiz o wrangler acha o projeto Pages
```
