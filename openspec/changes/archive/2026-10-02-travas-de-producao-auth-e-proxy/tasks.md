> Origem: auditoria `openspec/audits/2026-09-13-pre-deploy/` (GAP-003 e GAP-004). Configuração/código,
> independente da decisão de alvo de deploy (GAP-008).
>
> **STATUS 2026-09-13: GAP-003 IMPLEMENTADO** na branch `fix/pre-deploy-p0` (commit `92cfb98`): o boot
> aborta se `NODE_ENV=production` e `AUTH_REQUIRED≠1` (`erroDeAuthEmProducao`). Teste
> `tests/auth-producao-fail-closed.test.ts` (4/4). **GAP-004 (TRUST_PROXY)**: já é configurável no
> código (`app.ts:116`); documentado em `DEPLOY_GUIDE.md` como secret obrigatório no Fly.io.

> **Conferido no código em 2026-10-02** (origin/main `9573ab38`), task por task; o arquivo que prova cada uma
> está na própria linha. Portões e PoCs não foram rodados de novo nesta conferência: a evidência é a de 13/09,
> em `openspec/audits/2026-09-13-pre-deploy/IMPLEMENTATION_REPORT.md`.

## 1. Fail-closed de autenticação em produção

- [x] 1.1 `server/lib/auth.ts` + boot (`server.ts:247-250`): em `NODE_ENV=production`, abortar se
      `AUTH_REQUIRED !== '1'` (hoje só loga warning)
      — `server/lib/auth.ts` (`erroDeAuthEmProducao`), chamado no boot em `server.ts`. O código faz um pouco
      diferente do texto: `AUTH_REQUIRED` AUSENTE em produção já LIGA a auth (não aborta); aborta com `=0`,
      salvo com `SELF_HOST=1` declarado (instalação pessoal)
- [x] 1.2 `Dockerfile`/`docker-compose.yml`/`.env.docker.example`: tornar explícito o valor esperado
      e documentar que a imagem crua não sobe em público sem `AUTH_REQUIRED=1`
      — `docker-compose.yml` (`AUTH_REQUIRED: '1'`), `.env.docker.example` (bloco do `SELF_HOST`), `fly.toml` (`[env]`)

## 2. TRUST_PROXY correto

- [x] 2.1 `server/http/app.ts:116-117`: `TRUST_PROXY` configurável e documentado para o alvo escolhido
      — `server/http/app.ts` (`interpretarTrustProxy`), inventário em `server/lib/config.ts`, `fly.toml`
      (`TRUST_PROXY = "2"`), `docs/deploy.md`; e foi além: o boot aborta em produção sem ela
      (`erroDeTrustProxyEmProducao`, GAP-004)
- [x] 2.2 Confirmar que o rate-limit por IP e o `ip_hash` do ranking usam o IP real atrás do proxy
      — os dois leem `req.ip`: `server/lib/rateLimitStore.ts` (`chaveDoRequest`) e `server/routes/rank.ts`

## 3. Regressão

- [x] 3.1 Teste de boot: `NODE_ENV=production` sem `AUTH_REQUIRED` → processo aborta
      — `tests/auth-producao-fail-closed.test.ts` (6 casos; ver a nota do 1.1 sobre "ausente")
- [x] 3.2 Teste do limiter atrás de proxy: tentativas de um IP não geram 429 global
      — `tests/seguranca/limitador-de-falhas-de-auth.test.ts` (`TRUST_PROXY=1`, "estourado o balde de um
      IP, outro IP continua livre") e `tests/seguranca/trust-proxy-e-origem.test.ts`

## 4. Portões

- [x] 4.1 `npx vitest run` · `npm run typecheck` · `npm run lint`
      — `IMPLEMENTATION_REPORT.md`, "Portões verdes na base"
