# ADR 0015 — Cloudflare Workers no lugar do Fly

- **Data:** 2026-10-21
- **Estado:** aceito
- **Complementa:** ADR 0014 (Postgres agora); a decisão de hospedagem do ADR 0006 (uma máquina no Fly) deixa de valer
- **Spec:** `docs/specs/2026-10-19-migracao-cloudflare.md` (opção C)
- **Medições:** `docs/auditoria/2026-10-19-spikes-cloudflare.md`, `docs/auditoria/2026-10-20-fase4-staging.md`

## Contexto

O ADR 0006 mantinha o app numa máquina do Fly com SQLite e Litestream. O ADR 0014 trocou o banco para Postgres
como passo da migração para a Cloudflare. O Fly **nunca recebeu deploy**: o app nunca foi ao ar nele. Com o
Postgres do Supabase em `sa-east-1` e o Worker rodando o mesmo Express (`worker.ts`), a camada do Fly (`fly.toml`,
Litestream, snapshot do SQLite, workflows de deploy) ficou sem função e só aumentava a superfície a manter.

## Decisão

- **Servidor:** Cloudflare Workers (`worker.ts` + `wrangler.jsonc`), com `placement` em `aws:sa-east-1`. `/api/*` roda
  no mesmo Express; o resto sai dos assets do Worker.
- **Banco:** Postgres do Supabase em São Paulo, acessado pelo Hyperdrive.
- **Mídia:** R2 (`frasy-midia`). **Métricas:** Analytics Engine. **Logs:** observabilidade do Workers.
- **Deploy por versões:** `.github/workflows/deploy-worker.yml` faz `wrangler versions upload` e `deploy`, com
  fumaça e rollback. Rollback = `wrangler versions deploy` da versão anterior, ou rodar o workflow de novo com
  um `ref` mais antigo.
- **Backup:** `pg_dump` semanal (`backup-pg-dump.yml`) no bucket R2 `frasy-backups`; restauração com `pg_restore`
  (`docs/runbook.md` §8).
- **Infra reproduzível:** `scripts/cloudflare/` (buckets, Hyperdrive, secrets do Worker por `secrets.ts`).
- **Self-host:** continua por Docker/Node (`Dockerfile`, `docker-compose.yml` com `postgres:17`; modelo em
  `.env.production.example`).
- Saem do repositório: `fly.toml`, `litestream.yml`, os workflows do Fly, o snapshot do SQLite e as variáveis
  `BACKUP_*` e `LITESTREAM_*`.

## Alternativas consideradas

- **Ficar no Fly com SQLite.** Funcionaria, mas é um escritor único, sem alta disponibilidade, num terceiro
  fornecedor, e o dono já havia decidido centralizar na Cloudflare.
- **Cloudflare Containers.** Toda requisição passa por um Durable Object fora da América do Sul, o disco é
  efêmero e houve perda de escritas medida num `kill -9`.
- **D1 (e Durable Objects).** ~130 ms por ida ao banco do Brasil (spike S1), de 5 a 10 vezes mais lento.

## Consequências

- **Sem disco e sem cluster:** o Worker não guarda estado local; trabalho depois da resposta passa por
  `emSegundoPlano`. O modo cluster do Node fica só no self-host.
- **Crons exigem Workers Paid** (US$ 5 por mês; são 7 expressões em `wrangler.jsonc`).
- **Limites de CPU por requisição** passam a ser o teto de escala (junto com conexões do Hyperdrive e do Supabase),
  no lugar da CPU da máquina.
- **Operação nova:** `wrangler tail`, `scripts/cloudflare/` e o GitHub Environment por ambiente; a `SECRET_KEY` do
  Worker é `hkdf:<64 hex>`.
- **Self-host preservado:** quem roda em Docker/Node continua com o mesmo código e Postgres por `DATABASE_URL`.
