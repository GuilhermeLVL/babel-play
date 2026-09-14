# Guia de deploy — Fly.io (1 container + volume)

**Status: NÃO executado.** Este guia prepara o deploy; nenhuma conta foi criada e nada foi
publicado. O dono aprova antes de rodar.

## Por que Fly.io (e não Vercel)

O backend é um **Express stateful** que serve a SPA e a `/api` no mesmo domínio, grava SQLite e
áudio em disco, e **aborta o boot em multi-réplica sem storage compartilhado** (`server/lib/diretorios.ts`).
Vercel-serverless apagaria o banco e o áudio a cada invocação → seria reescrita. O `Dockerfile` do
repo já descreve exatamente um container long-lived; Fly.io roda esse container com um **volume
persistente** montado em `/data`, e o `scripts/backup.mjs` funciona (usa `VACUUM INTO` num `file:`).

Alternativa equivalente: **Cloud Run + Turso (`libsql://`) + Cloudflare R2** — o código já suporta
(env apenas), mas perde o backup local (usa snapshot do Turso) e exige R2 para o áudio.

## Pré-requisitos

- Conta Fly.io + `flyctl` instalado.
- Projeto Supabase (só auth): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- Conta Asaas (produção) + token do webhook.

## Passos

1. **`fly launch --no-deploy`** — gera `fly.toml` a partir do `Dockerfile`. Não commitar segredo nele.
2. **Volume**: `fly volumes create babel_data --size 3` e monte em `/data` no `fly.toml`
   (`[mounts] source="babel_data" destination="/data"`). É onde ficam `babel.db`, o áudio e
   `secret.key`.
3. **Build args do cliente** (o front precisa deles em build): `SUPABASE_URL`, `SUPABASE_ANON_KEY`
   entram como `--build-arg` (o `Dockerfile` os consome nas linhas 33-43).
4. **Secrets de runtime** (`fly secrets set ...`):
   - `SECRET_KEY=<32+ bytes aleatórios>` — obrigatório em produção (cifra as chaves BYOK).
   - `AUTH_REQUIRED=1` — **obrigatório**; sem isso o boot agora **aborta** (GAP-003).
   - `TRUST_PROXY=1` — **obrigatório atrás do proxy do Fly** (GAP-004): sem isso o rate-limit por IP
     vira lockout global do `/api`. `1` = um salto de proxy.
   - `NODE_ENV=production`, `DATABASE_URL=file:/data/babel.db`, `AUDIO_DIR=/data/audio`.
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (exclusão de conta usa a service role).
   - `ASAAS_API_KEY`, `ASAAS_BASE_URL=https://api.asaas.com/v3` (produção; o default é sandbox),
     `ASAAS_WEBHOOK_TOKEN=<segredo>`.
   - Opcional: `METRICS_ENABLED=1` **exige** `METRICS_TOKEN` (GAP-013); `GROQ_API_KEY`,
     `GEMINI_API_KEY` para a IA gerenciada.
5. **Webhook do Asaas**: apontar para `https://<app>.fly.dev/api/billing/webhook/asaas` com o header
   `asaas-access-token = ASAAS_WEBHOOK_TOKEN`.
6. **Health check** no `fly.toml`: `GET /api/ready` (o `Dockerfile` já usa esse path).
7. **Backup** (GAP-009): agendar `node scripts/backup.mjs` (cron/máquina Fly) e **copiar para fora**
   (ex.: `rclone` para R2/S3). Testar o restore num app de staging antes do go-live.
8. **Monitoramento** (GAP-012): definir a variável de repositório `HEALTH_URL=https://<app>.fly.dev/api/health`
   para o workflow `uptime.yml` deixar de ser inerte.

## Antes do go-live (bloqueadores que ainda faltam)

- **Congelar + CI verde** (GAP-007): decidir o destino do redesign-v4 (hoje em `git stash@{0}`),
  commitar o estado que vai a produção e ter **CI verde nesse commit**.
- **UI do age gate 18+** e **consentimento real de nuvem** (sobre o redesign-v4).
- **Teto de tokens** no `/api/gemini/chat` (GAP-010).
- **Staging separado** de produção e o **restore de backup testado**.
