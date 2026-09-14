# Backlog de lacunas — priorizado

Ordenado por prioridade. Detalhe estruturado (CWE/OWASP, PoC, cenário) em `SECURITY_FINDINGS.json`.
Legenda de status: **[executado]** provado por PoC · **[código]** confirmado por leitura.

## P0 — Bloqueantes (NÃO deployar enquanto abertos)

| ID | Lacuna | Impacto | Evidência | Esforço | Status |
|----|--------|---------|-----------|---------|--------|
| GAP-006 | Sem portão de idade / consentimento parental; público inclui crianças <12 | Violação LGPD art. 14; dado de menor tratado sem base legal | `src/lib/profile.ts:23`; ausência de fluxo | ~40h (produto+jurídico) | [código] |
| GAP-005 | Política de Privacidade contradiz o código (4 pontos) | Publicar política falsa é o dano; risco jurídico | `privacidade.html` × `schema.ts:488`, `profiles.ts:31,34`, `sessoes.ts:139` | 8h | [código] |
| GAP-001 | `/api/billing/assinar` concede plano pago sem pagamento | Perda de receita; qualquer conta vira Pro | `poc-billing.txt`; `billing.ts:200-206`→`entitlements.ts:31-33` | 4h | **[executado]** |
| GAP-002 | Bypass de SSRF (IPv6-mapped, CGNAT, NAT64) + redirects | Rouba credenciais de metadata da nuvem; scan interno | `poc-ssrf.txt` (6/8); `ssrf.ts:26-35`, `proxy.ts` | 6h | **[executado]** |
| GAP-003 | `AUTH_REQUIRED=0` honrado em produção; imagem bind 0.0.0.0 | Um erro de env expõe o app inteiro como "dono" | `auth.ts:25-28`, `Dockerfile:110` | 2h | [código] |
| GAP-004 | `TRUST_PROXY` ausente no deploy → lockout global do /api | 30 tokens ruins derrubam /api p/ todos por 15 min | `app.ts:116-117,313-327` | 2h | [código] |
| GAP-007 | O código de produção nunca passou pelo CI (16 commits à frente + suja) | Deploy de artefato não verificado | `evidencias/00-freeze.txt` | 3h | [código] |
| GAP-008 | Sem alvo de deploy funcional (Cloudflare apagado; só Docker+SQLite) | Não há como publicar de forma repetível; sem staging | `Dockerfile`, `docs/deploy.md` | 16h | [código] |
| GAP-009 | Backup/restore não testado no alvo; incompatível com Turso; sem off-site/rollback | Perda de dados sem recuperação | `backup.mjs:46-53`, `runbook.md:194` | 12h | [código] |
| GAP-010 | `systemInstruction` do cliente aceito; sem teto de tokens nem moderação | Chave do dono vira LLM geral; custo ilimitado | `llmRequest.ts:55`, `usageQuota.ts:150` | 8h | [código] |

## P1 — Altamente recomendados (deployar com plano de ação)

| ID | Lacuna | Impacto | Evidência | Esforço | Status |
|----|--------|---------|-----------|---------|--------|
| GAP-011 | Webhook Asaas confia no payload; token estático; sem HMAC/re-fetch | Token vazado concede qualquer plano | `billingEventos.ts`, `credits.ts:67` | 8h | [código] |
| GAP-012 | Monitoramento de uptime inerte (`HEALTH_URL` vazio); sem alertas | Queda em produção não notifica | `uptime.yml:8-10` | 4h | [código] |
| GAP-013 | `/metrics` aberto se `METRICS_ENABLED=1` sem token | Reconhecimento da superfície do servidor | `metricas.ts:220-234` | 1h | [código] |
| GAP-014 | Pesos de modelo sem revisão fixada nem integridade em runtime | Supply chain (LLM05) | `transformersEnv.ts:25-26` | 6h | [código] |
| GAP-015 | DoS de memória (JSON pré-auth; uploads sem concorrência; .docx zip bomb) | Derruba o container | `app.ts:153`, `document.ts:37` | 5h | [código] |
| GAP-016 | Sem DMCA/takedown nem licenciamento de conteúdo; atribuições não exibidas | Exposição a copyright | `termos.html`, `FONTES.md`, `images.ts:74` | 6h | [código] |
| GAP-017 | `billing_events.payload` guarda JSON cru (nome/CPF) sem retenção | Retenção indevida de PII | `schema.ts:584-603` | 4h | [código] |
| GAP-018 | E2E só cobre self-host (sem auth); cobertura ~45%, server.ts 0% | Fluxo público não testado ponta a ponta | `playwright.config.ts`, `coverage-summary.json` | 16h | [executado] |
| GAP-019 | Sem a11y automatizado (axe) no CI | Regressões de acessibilidade passam | `ci.yml` | 4h | [código] |
| GAP-020 | Licença inconsistente (MIT↔proprietária/UNLICENSED) | Ambiguidade jurídica | `LICENSE`, `package.json` | 2h | [código] |

## P2 — Melhorias pós-launch

| ID | Lacuna | Evidência | Esforço |
|----|--------|-----------|---------|
| GAP-021 | JWT sem `exp` exigido; chave legada hardcoded de decriptação | `auth.ts:119`, `crypto.ts:100` | 4h |
| GAP-022 | Cache estático sem `maxAge` no Node; CSP ampla; CLS 0,51 em /jogar | `server.ts:216`, `app.ts:186` | 8h |
| GAP-023 | Sem SBOM no CI; sem purga de soft-deleted; CHANGELOG/tags parados | `ci.yml`, `CHANGELOG.md` | 6h |
| GAP-024 | `console.error` fura a redação; texto de erro do cliente logado | `gemini.ts:209`, `erros.ts:87` | 3h |
| GAP-025 | Referências quebradas em docs (sonda-jwt, ADR 0001, backup:verificar) | `SECURITY.md`, `deploy.md` | 3h |

**Esforço total estimado:** P0 ≈ 93h (das quais ~40h são produto/jurídico de GAP-006) · P1 ≈ 56h · P2 ≈ 24h.
