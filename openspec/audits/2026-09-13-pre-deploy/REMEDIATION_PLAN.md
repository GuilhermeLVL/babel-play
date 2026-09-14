# Plano de correção

**Owner único:** Guilherme (GuilhermeLVL). Prazos relativos a 2026-09-13. Nenhum código de produto foi alterado nesta auditoria — cada P0 tem uma proposta de change OpenSpec correspondente (ver `openspec/changes/`).

## Onda 0 — Decisões que destravam tudo (próximas 48h)

| Ação | Lacuna | Tipo | Quem decide |
|------|--------|------|-------------|
| Definir o público: manter crianças <12 ou reposicionar 18+ | GAP-006 | Produto + jurídico | Dono |
| Escolher o alvo de deploy (Docker+SQLite, ou Pages+Cloud Run+Turso) e se haverá staging | GAP-008 | Infra | Dono |
| Definir a licença (proprietária vs MIT) | GAP-020 | Jurídico | Dono |

> Sem a decisão de GAP-006 não dá para dimensionar o esforço real: 18+ é ~4h (cláusula + aviso); <12 é um projeto de consentimento parental (~40h+ e revisão jurídica).

## Onda 1 — P0 de código (semana 1; ~14h, provados por PoC)

| Ação | Lacuna | Change proposta | Verificação |
|------|--------|-----------------|-------------|
| `/assinar` não grava plan/status; promoção só pelo webhook | GAP-001 | `billing-assinar-nao-concede` | Reproduzir `poc-billing.txt` e ver `free` permanecer; novo teste |
| Guard SSRF: normalizar IPv4-mapped, bloquear CGNAT/NAT64/198.18, sem redirects no proxy | GAP-002 | `ssrf-guard-completo` | Reproduzir `poc-ssrf.txt` e ver 0 bypass |
| Fail-closed de `AUTH_REQUIRED` em produção | GAP-003 | `auth-required-trava-em-producao` | Boot aborta sem `AUTH_REQUIRED=1` em prod |
| Definir/testar `TRUST_PROXY` no alvo | GAP-004 | `trust-proxy-obrigatorio` | Limiter chaveia por IP real atrás do proxy |

## Onda 2 — P0 de compliance e processo (semana 1–2)

| Ação | Lacuna | Change proposta |
|------|--------|-----------------|
| Alinhar política de privacidade ao código (ou desligar nuvem por padrão + consentimento real) | GAP-005 | `privacidade-alinhada-ao-codigo` |
| Portão de idade + consentimento parental (ou reposicionamento 18+) | GAP-006 | `portao-de-idade-e-consentimento` |
| Congelar commit + CI verde antes do go-live | GAP-007 | (processo; sem change) |
| Backup+restore no alvo, agendado, off-site, com rollback documentado | GAP-009 | `deploy-alvo-e-backup` |
| Teto de tokens + system prompt do servidor em `/api/gemini/chat` | GAP-010 | `gemini-teto-e-system-prompt` |

## Onda 3 — P1 (semana 2–4, deployar com plano)

Webhook Asaas HMAC/re-fetch (GAP-011) · monitoramento que notifica + `HEALTH_URL` (GAP-012) · `/metrics` fail-closed (GAP-013) · revisão fixada de modelos (GAP-014) · limites de memória/upload (GAP-015) · DMCA + atribuições (GAP-016) · retenção do payload de billing (GAP-017) · E2E do fluxo autenticado + cobertura (GAP-018) · axe no CI (GAP-019) · licença (GAP-020).

## Onda 4 — P2 (pós-launch)

JWT `exp` + chave legada (GAP-021) · cache/CSP/CLS (GAP-022) · SBOM no CI + purga + tags (GAP-023) · logs pela redação (GAP-024) · docs sem referências quebradas (GAP-025).

## Como reverificar (a auditoria é reproduzível)

- SSRF: `npx tsx` sobre um harness que chama `assertPublicUrl` com os vetores de `evidencias/poc-ssrf.txt` → esperar 0 bypass.
- Billing: harness que faz `subscriptionsRepo.upsert(uid,{plan:'pro',status:'trialing'})` e depois `getPlanForUser(uid)` sobre uma **cópia** do banco → esperar `free`.
- Scanners: `npm audit`, `trivy fs`, `gitleaks detect --config .gitleaks.toml`, `semgrep --config p/typescript,p/nodejs,p/expressjs,p/react`.
- Cobertura/testes: `npx vitest run --coverage` e `npx vitest run tests/seguranca`.

Todos os comandos e saídas cruas estão em `evidencias/`.
