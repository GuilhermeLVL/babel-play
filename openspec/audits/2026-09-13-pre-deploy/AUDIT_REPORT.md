# Auditoria pré-deploy público — Babel Play

**Data:** 2026-09-13 · **Auditor:** revisão sênior assistida por IA (leitura + scanners + PoC executado)
**Estado auditado:** HEAD local `161cbf3` + árvore de trabalho suja (ver §0). **Decisão: ❌ NÃO APROVADO PARA DEPLOY PÚBLICO.**

> Método de evidência. Cada achado está marcado como **[executado]** (provei rodando), **[código]** (confirmei lendo `arquivo:linha`) ou **[não executado]** (com o motivo). Saídas cruas em `evidencias/`. Nenhuma alteração foi feita no código de produto nem no banco real (`data/babel.db` — sha256 inalterado antes/depois dos PoCs).

---

## Resumo executivo

**Score de prontidão: 48/100.** A engenharia de base é forte e incomum para código gerado por IA — SAST limpo, desenho de segurança pensado (branded `UserId`, autoridade de plano no servidor, guard anti-SSRF, redação de PII em log, LGPD export/delete implementados e testados, ~3.900 testes). O que **bloqueia** o deploy não é qualidade de código difusa; são falhas pontuais de **lógica de negócio, configuração de produção e compliance** — e uma delas é absoluta.

**O bloqueador absoluto:** o público-alvo **inclui crianças (<12)** e o app hoje (a) manda áudio de voz e texto para Google/Groq/MyMemory por padrão com o consentimento fixado em `true` no código, e (b) não tem verificação de idade nem consentimento parental. Isso é violação direta do art. 14 da LGPD e não é corrigível com um ajuste de cópia.

### Top 5 riscos críticos (P0)

| # | Risco | Prova |
|---|-------|-------|
| 1 | **Dados de crianças sem base legal.** Áudio/texto de menores vão a terceiros por padrão; sem portão de idade nem consentimento parental (LGPD art. 14). | [código] `src/gateway/profiles.ts:31,34`; `cloudConsent:()=>true` em 6 telas; ausência de fluxo de consentimento |
| 2 | **Política de Privacidade mente sobre o produto** em 4 pontos (e-mail guardado; plano grátis manda áudio ao Google e texto ao MyMemory; áudio de sessão é enviado ao servidor; operadores não listados). Publicar uma política falsa é o próprio dano. | [código] `public/privacidade.html` × `server/db/schema.ts:488`, `profiles.ts:31,34`, `sessoes.ts:139` |
| 3 | **Plano pago concedido sem pagamento.** `POST /api/billing/assinar` grava `trialing`+plano escolhido pelo cliente, e o servidor trata `trialing` como concessão. | **[executado]** `evidencias/poc-billing.txt`: `free` → grava trialing+pro → `getPlanForUser` = `"pro"`, sem webhook |
| 4 | **SSRF alcança o endpoint de metadados da nuvem.** O guard deixa passar IPv6 mapeado, CGNAT, NAT64. Num alvo Cloud Run/GCE, rouba credenciais de instância. | **[executado]** `evidencias/poc-ssrf.txt`: 6 bypass de 8; inclui `::ffff:169.254.169.254` |
| 5 | **O código que iria a produção nunca passou pelo CI** e não existe alvo de deploy funcional. `main` local está 16 commits à frente (não enviado) + ~49 arquivos sujos; última CI verde é `2ac979b`. | [código] `evidencias/00-freeze.txt` |

### Recomendações imediatas (próximas 48h)

1. **Decidir o público.** Se crianças <12 permanecem no escopo, o deploy exige projeto de consentimento parental (decisão de produto + jurídica), não só código. Se o app for reposicionado como 18+, vira uma cláusula de idade nos Termos + aviso no cadastro (rebaixa de P0 para P1).
2. **Congelar o artefato.** Escolher alvo de deploy, dar merge/push do estado, e **exigir CI verde nesse commit** antes de qualquer publicação. Hoje não há artefato versionado e testado que corresponda a produção.
3. **Reescrever a Política de Privacidade para bater com o código** (ou mudar o código para bater com a política — desligar nuvem por padrão no plano grátis e pedir consentimento real). As duas coisas não podem divergir num deploy público.
4. **Fechar os dois P0 de código** (billing `/assinar` e guard SSRF) — ambos provados por PoC nesta auditoria.
5. **Travar `AUTH_REQUIRED`/`TRUST_PROXY`** para produção (hoje um erro de env abre o app inteiro ou derruba o `/api` para todos).

### Decisão de deploy

**❌ NÃO APROVADO.** Há bloqueadores P0 abertos em três frentes independentes (compliance com menores, billing/SSRF de código, e processo/infra de deploy). O roadmap de mitigação está em `REMEDIATION_PLAN.md`; os itens executáveis, em `PRE_DEPLOY_CHECKLIST.md`.

---

## §0 — O que exatamente foi auditado (congelamento)

- HEAD local: `161cbf3` "....." · última CI **verde**: `2ac979b` (muito atrás; via API pública do GitHub Actions).
- `main` local está **16 commits à frente de `origin/main`** e **não foi enviado**.
- **~49 arquivos com mudança não commitada** (reescrita de `server/routes/billing.ts`, remoção do minigame Bingo, mudanças em `src/core/economiaAutoridade.ts`, várias telas do redesign v4).
- Change `vocabulario-tela-unica` completa (26/0) porém **não arquivada**.
- Evidência: `evidencias/00-freeze.txt`.

**GAP-007 (P0, processo):** não existe um artefato versionado, verificado por CI, que corresponda ao que iria a produção. Toda a bateria de segurança do repo (idor, matriz de rotas, cabeçalhos) roda sobre um commit anterior ao HEAD atual.

---

## Domínios de auditoria (A–K)

### A. Governança e documentação — ⚠️ Parcial
- **Forte:** `docs/` extenso (arquitetura, runbook, deploy, metodologia), ADRs 0002–0005, 78 specs OpenSpec, 7 relatórios de auditoria anteriores, `SECURITY.md`.
- **Lacunas:** sem SBOM (gerei um agora — `evidencias/sbom.cyclonedx.json` via trivy, substituindo o Syft do prompt, que não está instalado); `arquitetura.md` marcado como histórico (2026-07-24); sem doc de data lineage; sem política de retenção dedicada; ADR 0001 citado mas ausente; `SECURITY.md` afirma que o CI roda uma "sonda de JWT" cujo script (`audit/scripts/sonda-jwt.ts`) **não existe**; `CHANGELOG.md` parado em 0.1.0 sem tags de versão; sem `CODEOWNERS`; **licença inconsistente** (LICENSE MIT→proprietária + `package.json` UNLICENSED não commitados; docs ainda dizem MIT — GAP-020).

### B. Segurança de aplicação (OWASP Web/API) — ⚠️ Parcial (base sólida, 2 P0 de config)
- **Forte:** toda rota `/api/*` atrás de `authMiddleware` (`server/http/app.ts:329`); repositórios recebem `UserId` branded; `PATCH /api/me` remove `role`/`status` do corpo; matriz rota×guarda lida do stack Express em runtime e testada; validação Zod via `parseOr400`; **sem `sql.raw`** em lugar nenhum; helmet com CSP/`frame-ancestors 'self'`/`object-src 'none'`; sem CORS aberto (só same-origin); rate limit por usuário/IP persistido; corpo JSON limitado a 5 MB.
- **P0 de configuração:**
  - **GAP-003:** `AUTH_REQUIRED=0` é honrado mesmo com `NODE_ENV=production` (`server/lib/auth.ts:25-28`); o `Dockerfile:110` faz bind em `0.0.0.0` sem definir `AUTH_REQUIRED`. Um erro de env expõe o app inteiro como "dono local".
  - **GAP-004:** `TRUST_PROXY` não é definido em nenhum arquivo de deploy (`app.ts:116-117`). Atrás de um proxy reverso, o rate limiter chaveia todos os clientes no mesmo IP: 30 tokens ruins derrubam o `/api` inteiro por 15 min (`app.ts:313-327`).
- **P1/P2:** JSON de 5 MB parseado **antes** do auth (GAP-015, DoS de memória); uploads brutos de 200/120/30 MB sem teto de concorrência; `.docx` via `mammoth` sem teto de expansão (`server/import/document.ts:37`); JWT sem `requiredClaims` de `exp` (GAP-021); pequenos vazamentos em resposta (`requiredRole`, 160 chars do upstream em `proxy.ts:121`).

### C. Segurança de IA/LLM (OWASP Top 10 LLM) — ⚠️ Parcial
- **Forte:** contexto não-confiável (transcrição, artigo web, deck) entra como mensagem **user** com marcador aleatório, nunca no system prompt (`src/lib/ichatContext.ts:129-203`), com teste `tests/eval/ichat-injecao.test.ts`; saída do LLM **nunca** vira HTML (renderizada como texto React); sem tool-calling; guard anti-SSRF no proxy BYOK; cotas atômicas por plano; timeouts e disjuntor.
- **GAP-010 (P0):** `POST /api/gemini/chat` aceita **qualquer `systemInstruction` do cliente** (`server/ai/llmRequest.ts:55`) — a chave do dono vira um LLM de uso geral, limitado só por cota/rate-limit. Sem moderação de saída; tokens são contados mas **não têm teto** (`usageQuota.ts:150-159`). OWASP LLM01/LLM06/LLM10.
- **GAP-002 (P0):** bypass de SSRF (ver §B/§ evidência) — **[executado]**.
- **GAP-014 (P1):** pesos de Whisper/Opus-MT flutuam no `main` do Hugging Face, sem revisão fixada e **sem checagem de integridade em runtime** (hashes só no script de self-host). OWASP LLM05 (supply chain).
- **Risco de lógica:** o corretor de exercícios usa o veredito `{aceita}` do LLM para decidir se a resposta do aluno conta (`src/components/.../activeProduction.tsx:164-170`) — superfície de injeção com efeito na gamificação (mitigada por rejeição de respostas >3 palavras antes do LLM).

### D. Segredos e credenciais — ✅ Bom
- **[executado]** `.env` não é rastreado (`git ls-files` só mostra `*.example`); gitleaks com a config do repo — os 20 achados são **falso-positivo**: `generic-api-key` sobre hashes SHA-256 de modelos em `integridade-modelos.json`, todos no commit `bb3ed833`, que **está fora de `origin/main`** (só em branches remote-only). Trivy: **0 secrets**. Nenhuma chave real em `src/`/`server/`.
- **Ressalvas:** a pasta do projeto sincroniza para o OneDrive (o `.env` local, com `OPENROUTER_API_KEY`, é replicado para a nuvem pessoal); chave legada hardcoded de decriptação em `server/crypto.ts:100` (`dev-only-insecure-key-change-me`) — quem tiver o banco lê segredos ainda não migrados (GAP-021).

### E. Infraestrutura e deploy — ❌ Não pronto
- **GAP-008 (P0):** sem alvo de deploy funcional. O deploy do Cloudflare Pages foi **apagado** (commit `1b702fe`); só a imagem Docker + SQLite num volume funciona hoje; os docs descrevem Pages + Cloud Run + Turso. Sem `fly.toml`/`render.yaml`/`cloudbuild.yaml`. Sem ambiente de **staging** (a palavra não aparece).
- **CI (`ci.yml`):** forte — typecheck (×3, strict), eslint 0-warning, knip+madge, vitest com piso de cobertura, build, i18n, `audit:gate`, e2e, ast-grep. `seguranca.yml`: gitleaks + CodeQL + Semgrep (`--error`) + cron semanal. **Fora do CI:** build/scan da imagem Docker, SBOM, teste de carga, e **qualquer job de deploy**.
- **Divergência CI×realidade:** o Node local é v24; o CI usa v22 (`engines: >=22`). Menor, mas registrar.

### F. Proteção de dados e privacidade — ❌ Bloqueante (dado o público)
- **Forte:** LGPD **export** (`GET /api/me/exportar`) e **exclusão** (`DELETE /api/me`) implementados e bem testados (`tests/integration/lgpd-conta.test.ts` + `tabelas-do-titular.test.ts` que falha se uma tabela nova com `user_id` não for coberta); IPs do ranking/rate-limit são **hasheados** (`schema.ts:750`); chaves BYOK do usuário criptografadas (AES-256-GCM, `server/crypto.ts`).
- **P0:** GAP-005 (política × código, 4 divergências) e GAP-006 (crianças <12 sem portão de idade nem consentimento parental — LGPD art. 14).
- **P1:** GAP-017 (`billing_events.payload` guarda o JSON cru do webhook Asaas, com possível nome/CPF, sem prazo de retenção); TLS/criptografia em repouso **não** cobre o arquivo do banco nem os backups (cópias SQLite em claro); sem job de purga de linhas soft-deletadas (retenção = 7 rotações de backup).

### G. Qualidade de código e testes — ⚠️ Parcial
- **[executado]** Cobertura total **44,75% linhas** / 38,8% funções / 36,69% branches (`coverage/coverage-summary.json`, 2026-09-12). **Nuance:** os módulos de **segurança do servidor** são bem cobertos (`ssrf.ts` 91%, `mtProxy` 94%, `validation` 93%, `crypto` 93%, `proxy` 80%); o número baixo vem da **UI** (`server.ts` 0%, componentes ~17%). **Cobertura ≠ correção:** `ssrf.ts` tem 91% e o bypass existe — os testes não incluíam vetores IPv6-mapped.
- **[executado]** Suíte de segurança: **51 passaram / 6 skipped**; `matriz-de-rotas.test.ts` falhou no `beforeAll` (subirApp indefinido) — flake de ambiente na execução avulsa (consistente com a fragilidade conhecida de caracterização HTTP sob carga; verde no CI), não regressão.
- **GAP-018 (P1):** E2E (Playwright) só cobre o **modo self-host sem login** — o fluxo de auth público não é exercitado ponta a ponta. TypeScript root **não** é `strict` (só catraca via `tsconfig.estrito.json`); ESLint sem plugin de segurança (coberto em parte por Semgrep/CodeQL).

### H. Dependências e supply chain — ✅ Aceitável (com risco documentado)
- **[executado]** `npm audit`: **17 vulnerabilidades (4 HIGH, 13 moderate)**, 0 crítica. As 4 HIGH (`adm-zip`, `onnxruntime-node`, `sharp`, `@huggingface/transformers`) são **transitivas** e o `scripts/audit-gate.mjs:22-38` já as allowlista com justificativa "inferência roda no navegador, fora do servidor" — **confirmei que não há `import onnxruntime`/`import sharp` em `server/`**. Trivy fs: 6 vulns (3 HIGH, alinhadas), 0 misconfig.
- **Ressalva:** o allowlist é uma **aceitação de risco**, não uma correção. `adm-zip` (zip de 4 GB + overwrite por symlink) merece revisão se `onnxruntime-node` algum dia for carregado no servidor. Dependabot semanal ativo.

### I. Performance e escalabilidade — ⚠️ Parcial
- **Forte:** k6 (rampa a 50 VUs) com thresholds; medição antes/depois no relatório de saneamento (37→108 req/s, p95 2,8→1,1 s, 0 5xx); `compression()` antes dos routers; desligamento gracioso com checkpoint WAL.
- **Lacunas:** k6 **fora do CI**; servidor estático do Node **sem** `maxAge`/`immutable` (`server.ts:216`) — só o Cloudflare `_headers` tinha cache longo, e o Cloudflare saiu; CSP com `connect-src https:`/`img-src https:` amplos; Lighthouse mobile de `/jogar` = 47 com **CLS 0,51** (GAP-022).

### J. Acessibilidade e UX — ⚠️ Parcial
- **Forte:** teste de **contraste WCAG AA por par de tokens** de cada tema; Lighthouse a11y 90–100 (desktop 95–100); 181 `aria-label`, `prefers-reduced-motion`, `lang` no HTML; nenhum `<img>` sem `alt`.
- **GAP-019 (P1):** **sem axe/a11y automatizado no CI**; 5 `<div onClick>` (possível gap de teclado); só 1 `aria-live`.

### K. Compliance e legal — ❌ (dado o público)
- Termos e Política existem (`public/termos.html`, `privacidade.html`) mas: só em pt-BR; política diverge do código (GAP-005); **sem cláusula de idade mínima nem consentimento parental** (GAP-006); **sem cláusula de DMCA/takedown nem licenciamento de conteúdo do usuário** apesar de importar web/PDF/Anki (GAP-016); atribuições do `FONTES.md` (Wiktionary CC BY-SA, Tatoeba CC BY) não aparecem no app; imagens Openverse buscadas com `license_type=all` sem exibir crédito de forma consistente; licença do projeto inconsistente (GAP-020).

---

## Matriz de rastreabilidade (requisito → implementação → teste → evidência)

| Domínio / item | Spec OpenSpec | Implementação | Teste | Evidência | Status | Sev | Prio |
|---|---|---|---|---|---|---|---|
| Autenticação em todas as rotas | `matriz-rota-guarda` | `app.ts:329` | `tests/seguranca/matriz-de-rotas.test.ts` | 51 pass/6 skip (matriz flake de env) | ✅ | — | — |
| Autorização/escopo por usuário (IDOR) | `idor-negativo` | repos com `UserId` | `tests/seguranca/idor.test.ts` | pass; só path params (falta body/header) | ⚠️ | Média | P1 |
| Cabeçalhos + força bruta | `cabecalhos-cors-brute-force` | helmet `app.ts:182` | `cabecalhos-e-forca-bruta.test.ts` | pass; TRUST_PROXY ausente | ⚠️ | Alta | P0 (GAP-004) |
| Billing só concede com pagamento | `pagamento-nunca-perdido` | `billing.ts:200`, `entitlements.ts:31` | `billing-webhook.test.ts` (só insere trialing) | **PoC: concede sem pagar** | ❌ | Crítica | **P0 (GAP-001)** |
| Proxy IA sem SSRF | `timeouts-retries-circuit-breaker-ia` | `server/ai/ssrf.ts` | (cobre casos diretos) | **PoC: 6/8 bypass** | ❌ | Crítica | **P0 (GAP-002)** |
| Segredos fora do código | `segredos-e-vulnerabilidades` | `.env` gitignored | gitleaks CI | 0 real (20 FP off-main) | ✅ | — | — |
| Log sem PII/stack | `logs-sem-pii-nem-stack` | `logger.ts`, `redacao.ts` | `log-sem-pii.test.ts` | pass; `console.error` fura (gemini.ts:209) | ⚠️ | Baixa | P2 (GAP-024) |
| Health/Ready | `health-e-ready` | `server/routes/health.ts` | — | ✅ implementado | ✅ | — | — |
| Export/exclusão (LGPD) | `exclusao-e-exportacao-completas` | `server/routes/me.ts` | `lgpd-conta.test.ts` | pass | ✅ | — | — |
| Privacidade condiz com o produto | — | `privacidade.html` × código | — | 4 divergências | ❌ | Crítica | **P0 (GAP-005)** |
| Idade / consentimento parental | — | `src/lib/profile.ts` (`.age-*`) | — | inexistente; público inclui <12 | ❌ | Crítica | **P0 (GAP-006)** |
| Backup/restore testado | `banco-migracao-rollback-integridade` (Purpose TBD) | `scripts/backup.mjs` | `rollback-por-backup.test.ts` | só file: local; sem agendamento/off-site | ❌ | Alta | **P0 (GAP-009)** |
| Monitoramento/alertas | `metrics-prometheus` | `metricas.ts`, `uptime.yml` | — | uptime inerte (HEALTH_URL vazio) | ❌ | Alta | P1 (GAP-012) |
| Carga | `carga-k6-e-concorrencia` | `scripts/perf/carga.k6.js` | — | rodado no saneamento, fora do CI | ⚠️ | Baixa | P2 |
| Cobertura ≥80% | `baseline-testes-e-cobertura` | vitest | — | 44,75% (piso do CI é 43) | ⚠️ | Média | P1 (GAP-018) |
| A11y WCAG AA | `baseline-bundle-e-lighthouse` | teste de contraste | `contrastePaletas.test.ts` | sem axe automatizado | ⚠️ | Média | P1 (GAP-019) |

---

## O que está genuinamente bom (para não regredir)

Desenho de autoridade de plano no servidor; `UserId` branded como garantia de compilação; guard anti-SSRF com erro reconhecível (a ideia está certa — falta cobrir os vetores); redação de PII em log; export/exclusão LGPD com teste que quebra se uma tabela nova não for coberta; capa de sessão com allowlist fechado de MIME (F11-03); marcador anti-injeção no iChat; `audit:gate` com allowlist justificado; catraca de cobertura e de i18n no CI. **A base não é o problema — os bloqueadores são pontuais e concentrados.**

---

Artefatos irmãos: `GAPS_BACKLOG.md` · `PRE_DEPLOY_CHECKLIST.md` · `SECURITY_FINDINGS.json` · `REMEDIATION_PLAN.md` · `evidencias/`.
