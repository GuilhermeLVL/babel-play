> Origem: auditoria `openspec/audits/2026-09-13-pre-deploy/` (GAP-003 e GAP-004). Configuração/código,
> independente da decisão de alvo de deploy (GAP-008).

## 1. Fail-closed de autenticação em produção

- [ ] 1.1 `server/lib/auth.ts` + boot (`server.ts:247-250`): em `NODE_ENV=production`, abortar se
      `AUTH_REQUIRED !== '1'` (hoje só loga warning)
- [ ] 1.2 `Dockerfile`/`docker-compose.yml`/`.env.docker.example`: tornar explícito o valor esperado
      e documentar que a imagem crua não sobe em público sem `AUTH_REQUIRED=1`

## 2. TRUST_PROXY correto

- [ ] 2.1 `server/http/app.ts:116-117`: `TRUST_PROXY` configurável e documentado para o alvo escolhido
- [ ] 2.2 Confirmar que o rate-limit por IP e o `ip_hash` do ranking usam o IP real atrás do proxy

## 3. Regressão

- [ ] 3.1 Teste de boot: `NODE_ENV=production` sem `AUTH_REQUIRED` → processo aborta
- [ ] 3.2 Teste do limiter atrás de proxy: tentativas de um IP não geram 429 global

## 4. Portões

- [ ] 4.1 `npx vitest run` · `npm run typecheck` · `npm run lint`
