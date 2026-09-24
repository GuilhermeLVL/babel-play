# Checklist de pré-deploy (GO / NO-GO)

Marcar cada item: ✅ atendido · ⚠️ parcial · ❌ não atendido. Estado em 2026-09-13.

## Bloqueantes (P0 — NÃO deployar se houver ❌)

- ❌ Nenhuma vulnerabilidade crítica de segurança aberta — **2 P0 provados por PoC** (GAP-001 billing, GAP-002 SSRF)
- ⚠️ Autenticação e autorização funcionando — guards ok, mas `AUTH_REQUIRED`/`TRUST_PROXY` não travados p/ produção (GAP-003, GAP-004)
- ✅ Secrets gerenciados corretamente (nada hardcoded) — `.env` gitignored, 0 secrets no trivy, gitleaks só FP
- ⚠️ HTTPS/TLS configurado — deixado para proxy externo; depende do alvo, que não existe (GAP-008)
- ❌ Backup e recovery testados — só file: local, sem agendamento/off-site/rollback (GAP-009)
- ❌ Monitoring e alertas ativos — uptime inerte (`HEALTH_URL` vazio), sem regras de alerta (GAP-012)
- ❌ Termos de uso e privacidade publicados e **verdadeiros** — política contradiz o código (GAP-005)
- ❌ **Consentimento de menores** — público inclui <12 sem portão de idade/consentimento parental (GAP-006)
- ⚠️ Prompt injection testado — iChat tem marcador + teste; mas `systemInstruction` do cliente é aceito (GAP-010)
- ❌ Artefato de produção verificado por CI — HEAD 16 commits à frente + sujo, CI verde só em `2ac979b` (GAP-007)

**Bloqueantes abertos: 7 ❌ + 4 ⚠️ que precisam virar ✅.**

## Altamente recomendados (P1 — deployar com plano de ação)

- ⚠️ Webhook de pagamento robusto (HMAC/re-fetch) — só token estático hoje (GAP-011)
- ⚠️ Code coverage > 80% — 44,75% (módulos de segurança do servidor ok; UI baixa) (GAP-018)
- ⚠️ Load testing — feito no saneamento, fora do CI
- ❌ Accessibility audit automatizado (axe) — inexistente (GAP-019)
- ⚠️ DLP em prompts/uploads — cotas/limites existem; sem filtro de conteúdo de saída
- ✅ Rate limiting ativo — por usuário/IP persistido (ressalva TRUST_PROXY em P0)
- ⚠️ Integridade de modelos (revisão fixada + hash em runtime) — só no self-host (GAP-014)
- ⚠️ Licença definida e consistente (GAP-020)
- ⚠️ DMCA/takedown + atribuições exibidas (GAP-016)
- ⚠️ Retenção de PII (payload de billing, soft-deleted) (GAP-017, GAP-023)

## Nice-to-have (P2 — deployar, melhorar depois)

- ⚠️ Cache longo para assets estáticos no Node; CSP mais estreita; CLS de /jogar (GAP-022)
- ❌ SBOM no CI (gerado manualmente nesta auditoria) (GAP-023)
- ⚠️ `exp` obrigatório no JWT; remover chave legada de decriptação (GAP-021)
- ⚠️ Logs: rotear `console.error` pela redação (GAP-024)
- ❌ Docs sem referências quebradas (sonda-jwt, ADR 0001, backup:verificar) (GAP-025)

## Portão de execução mínimo antes de QUALQUER go-live (mesmo interno)

1. Decidir alvo de deploy e público (adultos vs <12).
2. Congelar o commit e obter **CI verde nele**.
3. Fechar GAP-001, GAP-002, GAP-003, GAP-004 (código; ~14h somados).
4. Alinhar política de privacidade ao código (GAP-005) e resolver o consentimento de menores (GAP-006).
5. Backup+restore testado no alvo (GAP-009) e monitoramento que notifica (GAP-012).
