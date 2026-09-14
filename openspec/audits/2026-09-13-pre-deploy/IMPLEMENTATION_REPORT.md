# Relatório de implementação — rodada P0 (2026-09-13)

**Branch:** `fix/pre-deploy-p0`, a partir de `origin/main` (`2ac979b`, última CI verde).
**Por que essa base:** o HEAD local (`161cbf3`, "....") é um commit WIP **quebrado** — removeu
`src/core/passe.ts` mas deixou imports pendurados (`tsc` falha). O redesign-v4 (16 commits +
árvore suja) completa essa remoção; ficou **guardado em `git stash@{0}`** ("redesign-v4 WIP (dono)").
Os P0 são independentes da UI do redesign, então foram feitos sobre a base verde e ficam
mergeáveis por conta própria. Para retomar o redesign: `git stash pop` na `main`.

## O que foi feito (com validação)

| GAP | O que mudou | Arquivos | Validação (comando → resultado) |
|-----|-------------|----------|-------------------------------|
| **GAP-001** billing concede sem pagar | `subConcede` não concede em `trialing`; `/assinar` não sobrescreve plan/status de assinatura existente | `server/lib/entitlements.ts`, `server/routes/billing.ts` | `poc-billing` → **`free`** (era `pro`); `vitest billing-assinar-nao-concede` 4/4; `billing-webhook` 38/38 |
| **GAP-002** SSRF bypass | guard canonicaliza IPv4-mapped/NAT64 → IPv4, cobre 100.64/10, 198.18/15, 192.0.0/24, multicast (fail-closed); proxy IA `redirect:'manual'` | `server/ai/ssrf.ts`, `server/ai/proxy.ts` | `poc-ssrf` → **0/8 bypass** (era 6/8); `vitest ssrf-vetores` 10/10; `audit-a04/s01/s06` verdes |
| **GAP-003** auth fail-open em prod | boot **aborta** se `NODE_ENV=production` e `AUTH_REQUIRED≠1` | `server/lib/auth.ts` (`erroDeAuthEmProducao`), `server.ts` | `vitest auth-producao-fail-closed` 4/4 |
| **GAP-004** TRUST_PROXY | já é configurável no código (`app.ts:116`) → documentado no `DEPLOY_GUIDE.md` | — | (config de deploy) |
| **GAP-005** política × código | `privacidade.html` reescrita: e-mail guardado, áudio de sessão enviado, operadores listados (Groq/Google/MyMemory/Openverse/HF), retenção | `public/privacidade.html` | revisão humana |
| **GAP-006** idade (parte legal) | cláusula **18+** nos Termos e na Política | `public/termos.html`, `public/privacidade.html` | revisão humana |
| GAP-016 (P1, parcial) | linha de conteúdo importado + takedown nos Termos | `public/termos.html` | — |

Método TDD nos P0 de código: teste vermelho primeiro (`poc-*` viraram `tests/`), depois o mínimo
para passar, sem quebrar o caminho feliz. Commits: `b7f2577` (auditoria+propostas), `92cfb98`
(código+testes), `3f27f94` (legal).

## Portões verdes na base (`2ac979b` + P0)

- `npx tsc --noEmit` → **0 erros**
- `eslint src server server.ts tests --max-warnings 0` → **exit 0** (o `npm run lint` via hook rtk
  expande para `scripts/` e acusa `.mjs` pré-existentes fora do escopo do CI — ignorar)
- `vitest` das suítes afetadas → **50/50** (billing, webhook, entitlements, ssrf, proxy, credential, auth)
- PoCs reproduzidos: `poc-billing` → `free`; `poc-ssrf` → 0 bypass

## Ainda ABERTO desta rodada (deliberadamente adiado)

- **UI do age gate 18+** (tela no `src/components/Onboarding.tsx`) e **consentimento real de nuvem**
  (trocar `cloudConsent: () => true` nos 6 sites por preferência persistida) — vivem em arquivos que o
  redesign-v4 reescreve pesado (`LiveCapture.tsx`: 2521 linhas mudadas). Fazer agora daria conflito
  massivo e construiria sobre UI que será substituída. **Fazer sobre o redesign-v4 quando ele
  aterrissar**, junto da migração `age_confirmed_at` + endpoint (para nascerem coesos com a UI).
- **Deploy/staging** (Fly.io) — preparado em `DEPLOY_GUIDE.md`, **não executado** (o dono aprova antes).
- **P1/P2**: webhook Asaas HMAC/re-fetch (GAP-011), monitoramento/HEALTH_URL (GAP-012), integridade
  de modelos (GAP-014), i18n legal, SBOM no CI, etc. Ver `GAPS_BACKLOG.md`.

## Score

Dos 10 P0 originais: **4 fechados por código** (GAP-001/002/003 + GAP-004 documentado), **2 fechados
na parte legal** (GAP-005 política; GAP-006 cláusula 18+ — falta a UI de enforcement), **4 dependem de
decisão/deploy** (GAP-007 congelar/CI, GAP-008 alvo, GAP-009 backup, GAP-010 teto de LLM). Prontidão
sobe de **48 para ~66/100** nesta rodada; chegar a >80 exige a UI do age gate + consentimento sobre o
redesign, o deploy com backup/monitoramento, e o teto de tokens do `/api/gemini/chat`.

**Deploy ainda NÃO aprovado** — mas os bloqueadores de código provados por PoC estão fechados.
