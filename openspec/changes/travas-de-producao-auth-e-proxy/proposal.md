## Why

A auditoria pré-deploy de 2026-09-13 achou dois defaults de configuração que, num deploy público,
transformam um erro de operação em incidente de segurança. Ambos são de configuração/código, não
dependem de decisão de produto.

**1. `AUTH_REQUIRED=0` é honrado mesmo em produção (GAP-003).** `server/lib/auth.ts:25-28` desliga a
autenticação se `AUTH_REQUIRED` não for `1`, e o único efeito de fazer isso com `NODE_ENV=production`
é um warning de log (`server.ts:247-250`). A imagem Docker define `HOST=0.0.0.0` e `NODE_ENV=production`
(`Dockerfile:110,51`) mas **não define `AUTH_REQUIRED`** — quem define é o `docker-compose.yml:31`.
Subir a imagem crua (sem o compose) deixa todo request como o "dono local", com acesso total, e ainda
liga yt-dlp e o loopback de áudio. Fail-open em produção.

**2. `TRUST_PROXY` não é definido em nenhum arquivo de deploy (GAP-004).** `server/http/app.ts:116-117`
deixa `trust proxy` desligado por padrão. Atrás de um proxy reverso (o modelo de deploy documentado
em `docs/deploy.md`), o Express vê o IP do proxy para todos os clientes. O limiter de falha de
autenticação (30 tentativas/15 min por IP, `app.ts:313-327`) passa a somar todo mundo no mesmo IP:
**30 tokens ruins de um atacante bloqueiam o `/api` inteiro para todos os usuários por 15 minutos**
(negação de serviço, CWE-770). Além disso, todo o rate-limit por IP e o `ip_hash` do ranking passam
a registrar o IP errado.

## What Changes

- Em `NODE_ENV=production`, o boot SHALL exigir `AUTH_REQUIRED=1` e **abortar** (fail-closed) se
  ausente ou `0`, em vez de apenas logar um warning.
- A imagem/compose SHALL deixar explícito o valor de `AUTH_REQUIRED` esperado em produção (e o
  `docs/deploy.md`/`.env.docker.example` documentam que a imagem crua não deve subir sem ele).
- `TRUST_PROXY` SHALL ser configurável e documentado para o alvo de deploy escolhido, de modo que o
  limiter e o `ip_hash` chaveiem pelo IP real do cliente atrás do proxy.
- Teste que prova o fail-closed do boot e o keying correto do limiter atrás de proxy.

## Non-Goals

- Não escolhe o alvo de deploy (isso é GAP-008, decisão do dono).
- Não altera os limites numéricos do rate-limit, só o que é usado como chave.
- Não trata o modo self-host/local (onde `AUTH_REQUIRED=0` é legítimo e intencional).
