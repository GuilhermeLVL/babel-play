# Auditoria de segurança — 26/09/2026

Branch `auditoria/seguranca-2026-09`, criada a partir de `main` (`050a16f`). Nada foi enviado ao GitHub.
Escopo: a SPA React e a API Express/SQLite, no modo público (`AUTH_REQUIRED=1`). As auditorias anteriores
não foram refeitas. Esta rodada confere se houve regressão nelas e cobre o que elas não viam:

- `2026-09-09-fase4-seguranca.md`;
- `2026-09-13-pre-deploy/*`;
- `2026-09-25-prontidao/*`.

## 1. Metodologia

As referências vêm de `docs/pesquisa/2026-09-auditoria-seguranca-performance-dispositivos.md` §1:

- OWASP ASVS 5.0, nível **L2**, nos capítulos V1–V9 e V11–V16 (V10 OAuth e V17 WebRTC não se aplicam);
- OWASP Top 10:2025;
- API Security Top 10:2023;
- OWASP LLM Top 10 (lista 2026 de fonte secundária, conferir no PDF oficial);
- CWE Top 25 2025.

Foram quatro frentes:

1. **Segredos.** gitleaks sobre todo o histórico e sobre a árvore; varredura de padrões de chave no código;
   inventário das variáveis `VITE_*`; conferência de `.gitignore` e `.env*.example`.
2. **SAST/SCA.** Semgrep com os seis pacotes pedidos, `npm audit` (produção e completo) e Trivy `fs`
   (vuln + secret + misconfig, HIGH/CRITICAL). Cada achado foi triado.
3. **Revisão manual guiada pelo ASVS L2.** Leitura da montagem (`server/http/app.ts`), das rotas e das
   guardas. Onde já existe teste que prova a propriedade, a evidência é o teste, rodado nesta rodada.
4. **Rate limit e proteção do banco.** Leitura da pilha rota × limitador. Cada lacuna foi fechada com TDD:
   primeiro o teste vermelho, depois a correção, depois o teste verde.

### Ferramentas e versões

O Docker Desktop **não subiu** nesta máquina. O log registra
`backend cancelling with error: starting services: initializing Inference manager: ... remove ...\Docker\run\dockerInference: The file cannot be accessed`
(`%LOCALAPPDATA%\Docker\log\host\com.docker.backend.exe.log`, 22:47:52Z). Por isso usei os binários
nativos já instalados, nas mesmas versões das imagens:

| Ferramenta | Versão | Como rodou | Saída |
| --- | --- | --- | --- |
| gitleaks | 8.30.1 | `gitleaks git . --config .gitleaks.toml` (histórico, 936 commits, 106 MB) e `gitleaks dir .` | 20 achados antes da allowlist → 0 depois; `dir`: 0 |
| TruffleHog | — | **não rodou**: não há binário local e o Docker não subiu | entrou no CI (§5) com `--results=verified` |
| Semgrep | 1.176.1 (o 1.178.0 exigiria Docker/pip novo) | `semgrep scan --config p/javascript p/nodejs p/react p/secrets p/owasp-top-ten p/security-audit` sobre `server server.ts src scripts tests .github Dockerfile vite.config.ts` | 356 regras, 798 arquivos, 10 achados |
| npm audit | npm 11.16.0 | `npm audit --omit=dev --json` e `npm audit --json` | produção: 7 (4 high, 3 moderate); completo: 17 (4 high, 13 moderate) |
| Trivy | 0.74.0 | `trivy fs --scanners vuln,secret,misconfig --severity HIGH,CRITICAL --skip-dirs node_modules .` | 4 vulnerabilidades e 2 misconfigs |
| vitest / tsc / eslint | 4.1.10 / projeto / projeto | gates da §7 | — |

## 2. Segredos

**Histórico (gitleaks).** Houve 20 achados `generic-api-key`, todos do commit `bb3ed83` (2026-08-18), nos
arquivos `audit/baseline/seguranca/integridade-modelos.json` e `audit/evidence/fase-13/integridade-modelos.json`.
São **falsos positivos**: os valores são SHA-256 de arquivos de peso de modelo. A regra casa pelo nome da chave
(por exemplo `"Xenova/opus-mt-ROMANCE-en/tokenizer.json": "34979cc7…"`, confirmado com `git show bb3ed83:…`).
Os dois arquivos já não existem na árvore. Entraram na allowlist por caminho (`.gitleaks.toml`, com o motivo
escrito), e a nova varredura do histórico terminou em `no leaks found`.

**Código.** Busquei `process.env.<*SECRET|KEY|TOKEN|PASS…*> ?? '…'` em `server/`, `src/`, `scripts/`,
`server.ts` e `vite.config.ts`: nenhum default secreto. Busquei também chaves com cara de real (`sk-…`,
`gsk_…`, `AIza…`, JWT, URL com `?key=`, `BEGIN PRIVATE KEY`). Só aparecem cargas de teste inventadas:

- `tests/seguranca/log-sem-pii.test.ts:107-108`;
- `tests/integration/audit-s01-credential-exfil.test.ts:23`;
- `tests/integration/mt1-tenant-credentials-secrets.test.ts:16`.

A chave legada de decriptação existe só em `scripts/db/recifrar-segredos-legados.ts:27`, o script de migração
dos segredos antigos. É o GAP-021, já conhecido. Ela saiu do servidor (`server/crypto.ts:101-105`).

**`.env`.** `git ls-files` só lista `.env.example`, `.env.production.example` e `.env.docker.example`.
`git log --all --diff-filter=A` não mostra nenhum `.env` real versionado em nenhum momento. Os exemplos têm só
placeholders (`SEU-PROJETO`, `SUA-CONTA`, valores vazios). O `.env.production.example` não lista 28 variáveis
opcionais do inventário (`server/lib/config.ts`), por exemplo `CLUSTER_WORKERS`, `SUPABASE_JWT_SECRET` e
`STT_API_KEY`. Nenhuma delas é de segurança obrigatória: `TRUST_PROXY`, `ORIGEM_SEGREDO`,
`ASAAS_WEBHOOK_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY` e `METRICS_TOKEN` estão lá. O `.env.example` é conferido
contra o inventário por `tests/integration/config-inventario.test.ts:128-145`.

**`.gitignore`.** Já cobria `.env`, `.env.*` (com `!*.example`), `/data/`, `*.db*`, `*.sqlite`, `dist/`,
`backups/` e `.mcp.json`. **Faltavam chaves e dumps.** Acrescentei `*.pem`, `*.key`, `*.p12`, `*.pfx`,
`*.jks`, `id_rsa*`, `id_ed25519*`, `*.sqlite3`, `*.sql.gz`, `*.dump` e `dump-*.sql`. A única exceção a
`*.db` é `tests/fixtures/banco-estado-atual.db`. Conferi o conteúdo com `node:sqlite`: há 1 usuário
`local-owner` com `email` nulo, nenhuma credencial e `billing_events` vazio.

**`VITE_*`, que vão para o bundle.** Nenhuma é segredo.

| Variável | Onde é lida | Classificação |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | `src/lib/supabase.ts:29` | pública (URL do projeto) |
| `VITE_SUPABASE_ANON_KEY` | `src/lib/supabase.ts:30` | pública por desenho. Só autentica no Supabase Auth; os dados ficam no SQLite do servidor, atrás do JWT verificado |
| `VITE_AUTH_REQUIRED` | `src/lib/supabase.ts:75`, `src/lib/identidade.ts` | flag |
| `VITE_PUBLIC_URL` | `vite.config.ts:56,99` | pública (canonical/og) |
| `VITE_SENTRY_DSN` | `src/lib/relatorioDeErros.ts:35` | pública (DSN de navegador) |
| `VITE_TURNSTILE_SITE_KEY` | `src/lib/turnstile.ts:27` | pública (site key; a secret fica no servidor) |
| `VITE_SELF_HOST_MODELS` | `src/gateway/adapters/transformersEnv.ts:24` | URL pública dos pesos |
| `VITE_OLLAMA_URL` | `src/gateway/profiles.ts:17` | URL local do usuário |
| `VITE_EDICAO_ESTATICA` | `src/lib/edicaoEstatica.ts:20` | flag |
| `VITE_CACHE_DIR` | só `vite.config.ts:90`, nunca no cliente | build |

**Rotação.** Não há segredo real no repositório nem no histórico. Continua valendo a recomendação anterior: o
dono deve **rotacionar as chaves Groq e OpenRouter** que foram coladas no chat. Elas nunca entraram no git, e é
justamente por isso que nenhuma varredura consegue dizer se ainda valem.

## 3. SAST/SCA: triagem

### Semgrep (10 achados)

| Regra | Onde | Veredito |
| --- | --- | --- |
| `express-res-sendfile` (WARNING) | `server/http/estaticos.ts:137` | **FP**: o caminho é constante, `path.join(distPath, 'index.html')` |
| `direct-response-write` (WARNING) | `server/routes/sessions.ts:134` | **FP**: a capa só sai com o subtipo numa lista FECHADA (`server/lib/capaDeSessao.ts:36-61`, sem `svg+xml`), mais `nosniff` do helmet |
| `secrets-inherit` ×2 (ERROR) | `.github/workflows/deploy.yml:171,186` | **P2**: é um workflow reutilizável do próprio repositório, e os secrets são por Environment. Recomendo trocar `secrets: inherit` pela lista explícita |
| `dangerous-subprocess-use-tainted-env-args` ×2 (ERROR) | `scripts/eval-fala/baixar-bancada.py:215-216` | **FP em produção**: script de bancada local, fora da imagem |
| `dynamic-urllib-use-detected` (WARNING) | `scripts/eval-fala/baixar-corpus.py:60` | idem |
| `dependabot-missing-cooldown` ×3 | `.github/dependabot.yml` | **corrigido**: cooldown de 7 dias (A03:2025) |

Nenhum ERROR em `server/`, `server.ts` nem `src/`. Por isso o novo passo do CI roda com `--error` (§5).

### npm audit e Trivy

| Pacote | Aviso | Alcançável? | Veredito |
| --- | --- | --- | --- |
| `qs` 6.15.3 (via `express` 4.22.2) | GHSA-x5fp-wj9c-mxmx, GHSA-4mjr-xmp4-gh2g (DoS) | **sim**: o parser "extended" do Express 4 passa TODA query por `qs`, antes do auth | **corrigido** com `app.set('query parser','simple')` (`server/http/app.ts:154`). Nenhuma rota usa `a[b]=`, conferido por grep em `src/` |
| `adm-zip` 0.5.18 | GHSA-xcpc-8h2w-3j85, GHSA-7q85-xj36-vmfc, GHSA-vwc7-r8mq-g2x9 | **não**: só o instalador do `onnxruntime-node` usa. O servidor lê zip com `jszip` (`server/import/anki.ts:8`), e o Dockerfile apaga `onnxruntime-node` (`Dockerfile:119`) | P2: some ao atualizar `@huggingface/transformers` |
| `sharp` 0.34.5 | GHSA-f88m-g3jw-g9cj, GHSA-rgj7-g3m4-5g8c (libvips/libheif) | **não**: nada no servidor importa `sharp`. A imagem instala com `--ignore-scripts` (sem o binário nativo) e apaga `@huggingface` | P2: mesmo caminho |
| `@huggingface/transformers` | herda os dois de cima | só no cliente (navegador) | P2 |
| dev: `vitest`/`@vitest/mocker` (GHSA-82fw-gwwq-j7x9), `esbuild` (dev server), `uuid`, `hyperid` | — | só em desenvolvimento/CI | P2 (Dependabot) |
| Trivy DS-0031 ×2 (CRITICAL) | `Dockerfile:153,155` (`ARG`/`ENV` de `VITE_*`) | não | **FP**: as quatro são públicas (tabela da §2); o Trivy casa pelo sufixo `_KEY`/`_DSN` |

## 4. Achados e correções

### P1: corrigidos nesta rodada (TDD)

| ID | Achado | Referência | Evidência do defeito (teste vermelho) | Correção | Commit |
| --- | --- | --- | --- | --- | --- |
| **S26-01** | **SSRF por DNS rebinding.** `assertPublicUrl` resolvia o nome, e o `fetch` resolvia de novo ao conectar. Um domínio com TTL 0, ou um nome público que aponta para loopback (`127.0.0.1.nip.io`), passava na guarda e conectava em 127.0.0.1, na 6PN do Fly ou na porta interna de métricas. O proxy BYOK devolve o corpo da resposta ao chamador | CWE-918/367, API7:2023, ASVS V15/V12 | `tests/seguranca/ssrf-rebinding.test.ts` antes da correção: com a guarda de nome enganada, `extractArticle('http://localhost:…')` **resolveu** e buscou o conteúdo interno ("promise resolved … instead of rejecting") | `lookupSoPublico` + `despachanteSeguro` (undici `Agent` com `connect.lookup`), em `server/ai/ssrf.ts:152-182`: o IP conferido é o IP conectado. Aplicado em `server/ai/proxy.ts:86,152`, `server/ai/sttProxy.ts:345` e `server/import/web.ts:38`. Sonda real: `127.0.0.1.nip.io` → BLOQUEADO; `https://example.com` → 200 | `cf592b5` |
| **S26-02** | **STT BYOK seguia redirect.** O GAP-002 pôs `redirect:'manual'` só no chat. Um provedor cadastrado pelo usuário respondendo 302 para IP literal interno (que não passa pelo `lookup`) levava o áudio e o Bearer até lá | CWE-918, regressão parcial do GAP-002 | caso estrutural em `ssrf-rebinding.test.ts` (0 de 1 `redirect:'manual'` no `sttProxy.ts`) | `redirect: 'manual'` em `server/ai/sttProxy.ts:344` | `cf592b5` |
| **S26-03** | **Leitura autenticada sem teto.** O `writeLimiter` pula GET (`app.ts`, `skip`), e nenhum outro limitador cobria GET fora de `/api/ai`, `/api/import` e `/api/tutor`. `GET /api/me/exportar` (`server/routes/me.ts:217`) monta a conta inteira em memória a cada chamada; `GET /api/sessions/utterances/all` e `GET /api/vocab` devolvem listas inteiras. Uma conta sozinha "espanca" o SQLite e o heap | API4:2023, CWE-770, ASVS V2.4 | `tests/seguranca/limites-de-leitura.test.ts` vermelho: 10 exportações e 400 leituras seguidas sem nenhum 429 | exportação: 5 por hora por usuário, no banco; leitura geral: 300/min por usuário, **em memória**, para não gravar um UPSERT por GET (`server/lib/limitesDeLeitura.ts`, `app.ts:529-531`) | `b818cc8` |
| **S26-04** | **Busca de imagens sem teto.** `GET /api/images/search` (`server/routes/images.ts:57`) faz uma chamada de saída ao Openverse por requisição: o servidor vira amplificador contra um terceiro, e o IP bloqueado seria o dele | API4/API10:2023 | idem, 100 buscas sem 429 | 60/min por usuário, balde próprio no banco (`METRIC_RATELIMIT_IMAGENS`). O cliente cai direto no Openverse quando recebe 429 (`src/data/rotas/imagens.ts:26-33`) | `b818cc8` |
| **S26-05** | **`/api/ready` pública amplificava custo.** Sem token e sem teto, cada chamada fazia uma consulta ao banco, a conferência de migrações e, com R2, um HEAD cobrado (`server/routes/health.ts`, `sondar()`) | API4:2023, CWE-400 | `at` diferente em duas chamadas seguidas (as sondas foram refeitas) | veredicto guardado por 5 s, com uma sonda em voo (`health.ts:123,140`). Não usei rate limit por IP de propósito: atrás de proxy sem `TRUST_PROXY` todos dividiriam o balde, e um 429 tiraria a máquina do balanceador. O Fly sonda a cada 15 s (`fly.toml:84-86`), então continua vendo veredicto novo | `b818cc8` |
| **S26-06** | **`qs` com DoS alcançável antes do auth** | A06:2025 (componente vulnerável), CWE-400 | teste "a sintaxe aninhada não vira objeto" | parser de query `simple` | `b818cc8` |

### P2: corrigidos junto

- **S26-07.** `GET /api/rank/:jogo` era pública, ia ao banco e não tinha balde nenhum (o `writeLimiter` pula
  GET). Agora tem 120/min por IP, em memória (`app.ts:346`). A matriz também passou a cobrar limitador em toda
  rota pública, com três exceções justificadas: `health`, `ready` e `abertura`
  (`tests/seguranca/matriz-de-rotas.test.ts`).
- **S26-08.** A matriz rota × guarda não sabia que o `writeLimiter` pula GET. Com isso, qualquer limitador em
  `/api` faria o portão de escrita passar por vacuidade. Agora cada limitador declara os verbos que conta
  (`marcarVerbos`) e `_matriz.ts` filtra por eles. Há dois casos novos: leitura privada com teto, e exportação e
  imagens com balde próprio.
- **S26-09.** Dependabot sem cooldown. `.gitignore` sem chaves e dumps. Allowlist do gitleaks.

### P2: documentados, sem correção nesta rodada

| ID | Item | Evidência | Recomendação |
| --- | --- | --- | --- |
| S26-10 | `secrets: inherit` no deploy | `deploy.yml:171,186` | listar só os secrets que `implantar-ambiente.yml` usa |
| S26-11 | Os tetos em memória (leitura geral e placar) valem **por worker** com `CLUSTER_WORKERS=N` | `server/lib/limitesDeLeitura.ts` (cabeçalho) | aceito: sem eles não havia teto. Revisitar junto com o ADR 0006 (Postgres/réplicas) |
| S26-12 | Os 401 do webhook do Asaas não entram no limitador de falhas: o webhook é montado antes dele. Continua coberto pelo `writeLimiter` por IP (120/min) e por comparação em tempo constante (`billing.ts:461-466`) | `app.ts` (ordem de montagem) | o token deve ter ≥ 32 bytes aleatórios; se quiser, montar o limitador de falhas também no webhook |
| S26-13 | `billing_events.payload` guarda o JSON cru, com nome e CPF | `billing.ts:497` | continua sendo o GAP-017 (retenção) |
| S26-14 | `dangerouslySetInnerHTML` com o SVG do QR de 2FA | `src/components/auth/SecurityPanel.tsx:14` | a origem é a resposta do Supabase (`mfa.enroll`), não entrada de usuário. Dá para trocar por `<img src="data:image/svg+xml,…">` |
| S26-15 | `sharp`, `adm-zip` e `@huggingface/transformers` com avisos, mas inalcançáveis no servidor | §3 | atualizar `@huggingface/transformers` quando sair versão com `onnxruntime-node`/`sharp` corrigidos; tirar `sharp` da imagem |
| S26-16 | TruffleHog não rodou localmente | §1 | vale o job novo do CI. Quando o Docker voltar, rodar `trufflesecurity/trufflehog git file:///repo --results=verified` uma vez sobre o histórico inteiro |
| S26-17 | `.env.production.example` não lista 28 variáveis opcionais | §2 | completar como comentários |
| — | GAP-006 (UI do portão de idade), GAP-014 (integridade dos pesos em runtime), GAP-017, GAP-021 | auditorias anteriores | continuam abertos. Nenhuma regressão encontrada |

### Regressão das auditorias anteriores

| Item anterior | Estado hoje | Evidência |
| --- | --- | --- |
| GAP-001 (billing concede sem pagar) | fechado | commit `92cfb98`; `tests/integration/billing-*` na suíte completa |
| GAP-002 (SSRF por IPv6-mapped, CGNAT, redirects) | fechado no chat; **reaberto parcialmente e fechado agora** no STT (S26-02) e para rebinding (S26-01) | `tests/seguranca/ssrf-vetores.test.ts` + `ssrf-rebinding.test.ts` |
| GAP-003 (auth fail-open em produção) | fechado | `server/lib/auth.ts` (`erroDeAuthEmProducao`); `tests/auth-producao-fail-closed.test.ts` |
| GAP-004 (TRUST_PROXY/origem) | fechado | `app.ts` (TRUST_PROXY, `exigirOrigem`); `tests/seguranca/trust-proxy-e-origem.test.ts` |
| GAP-010 (teto de tokens / `systemInstruction`) | fechado | `tests/integration/audit-s06-llm-request.test.ts:23-44`; clamp `MAX_OUTPUT_TOKENS` em `server/ai/proxy.ts` |
| GAP-011 (webhook confia no payload) | fechado | commit `35bc2d6` (confere o pagamento na API do Asaas); idempotência em `billing.ts:497` |
| GAP-013 (`/metrics` aberto) | fechado | `tests/metricas-producao-fail-closed.test.ts` |
| GAP-015 (DoS de memória por JSON antes do auth e uploads) | fechado | `tests/seguranca/limites-de-corpo.test.ts`, `uploads-grandes.test.ts` |
| GAP-021 (JWT sem `exp`) | fechado | `requiredClaims: ['exp']` em `auth.ts`; `tests/jwt-exige-exp.test.ts` |
| GAP-024 (log fura a redação) | fechado | `tests/seguranca/log-sem-pii.test.ts` |

## 5. CI

`.github/workflows/seguranca.yml`:

- **Job `trufflehog` novo.** Usa `trufflesecurity/trufflehog@4dd8831c…` (v3.97.9; SHA conferido com
  `git ls-remote`) com `--results=verified`. Só acusa credencial que ainda autentica, então não gera falso
  positivo para triar.
- **Passo novo de Semgrep.** Roda `p/javascript p/nodejs p/react p/secrets p/owasp-top-ten p/security-audit`
  com `--error` sobre `server server.ts src`. Na varredura manual deu zero ERROR nessas pastas. O passo antigo
  (`p/typescript p/nodejs p/expressjs p/react`) continua.
- **gitleaks-action.** O pin `ff98106e…` corresponde a `v2.3.9` (conferido com `git ls-remote`).

`.github/dependabot.yml`: `cooldown.default-days: 7` nos três ecossistemas.

## 6. Checklist ASVS 5.0 L2 (resumo)

Legenda: ✅ atende com evidência · ⚠️ atende com ressalva P2 · ❌ não atende.

| Capítulo | Estado | Evidência principal |
| --- | --- | --- |
| V1 Encoding/Sanitization | ✅ | Drizzle parametrizado (nenhum SQL por concatenação no SAST); `T.tsx` sem HTML; Anki hostil em `tests/seguranca/anki-html-hostil.test.ts`; ressalva S26-14 |
| V2 Validação e lógica de negócio | ✅ | zod em `server/validation.ts` (`parseOr400`); tetos de pontos e combo no placar; antiautomação: limitadores + S26-03/04/07 |
| V3 Frontend | ⚠️ | CSP estrita, sem `https:` curinga (`tests/seguranca/csp-estreita.test.ts`); helmet (`cabecalhos-e-forca-bruta.test.ts:45-83`); COOP/COEP opt-in por `CROSS_ORIGIN_ISOLATION` (`app.ts`); ressalva S26-14 |
| V4 API | ✅ | 404 JSON; envelope de erro; sem CORS (`cabecalhos-e-forca-bruta.test.ts:86-107`); limites de corpo |
| V5 Arquivos | ✅ | tipo por magic bytes (`server/lib/tipoDeArquivo.ts`), semáforo de uploads, teto por streaming (`uploads-grandes.test.ts`); `resolverDentroDe` contra path traversal (`server/lib/armazenamento.ts:53`) |
| V6 Autenticação | ✅ | Supabase; limitador de falhas 30/15 min (`cabecalhos-e-forca-bruta.test.ts:139`); 2FA/AAL2 nas rotas sensíveis (`aal2-rotas-sensiveis.test.ts`) |
| V7 Sessão | ✅ | Bearer, sem cookie; CSRF não se aplica, e o teste trava isso (`cabecalhos-e-forca-bruta.test.ts:119-130`) |
| V8 Autorização | ✅ | IDOR gerado a partir da pilha real para toda rota com `:id` (`tests/seguranca/idor.test.ts:349-444`); RBAC `requireRole` em todas as 12 rotas admin (`server/routes/admin.ts:33-225`) |
| V9 Tokens (JWT) | ✅ | `algorithms` fixos (ES256/RS256 via JWKS; HS256 só sem URL), `aud`, `iss`, `exp` obrigatório (`server/lib/auth.ts`) |
| V11 Criptografia | ⚠️ | AES-256-GCM para segredos BYOK; chave fora do código (`server/crypto.ts`); legado só no script de migração (GAP-021) |
| V12 Comunicação | ✅ | TLS no Fly/Cloudflare; `ORIGEM_SEGREDO`; saída para URL do usuário presa a IP público na conexão (S26-01) |
| V13 Configuração | ⚠️ | inventário de env conferido no boot e em teste; segredos fora do git (§2); S26-10/15/17 |
| V14 Proteção de dados | ⚠️ | exportação e exclusão LGPD; export sem segredo (`me.ts:208-216`); GAP-017 aberto |
| V15 Código e arquitetura seguros | ✅ | SSRF com guarda de nome + guarda de conexão; dependências com Dependabot + cooldown; SAST no CI |
| V16 Logs e erros | ✅ | `erroDeRota`/`erroGlobal` respondem genérico + `requestId` e nunca a causa (`server/lib/erroDeRota.ts:37-95`); redação (`log-sem-pii.test.ts`) |
| LLM01/03 (injeção, agência) | ✅ | o tutor não tem ferramentas nem recuperação de dados (nenhum `tools` em `server/ai/llmClient.ts`), então injeção não lê dado de outro usuário; cerca com nonce (`tests/eval/ichat-injecao.test.ts`) |
| LLM06 (consumo) | ✅ | teto de tokens por função, cota atômica, admissão por provedor, 60/min nas rotas de IA |
| LLM10 (saída) | ✅ | a saída do modelo não vira HTML (nenhum `dangerouslySetInnerHTML` fora do QR de 2FA) |

## 7. Gates

| Gate | Resultado |
| --- | --- |
| `npx tsc --noEmit` | `No errors found` |
| `eslint src server server.ts tests --max-warnings 0` | exit 0 |
| vitest completo `--maxWorkers=3` | **493 arquivos, 5083 passaram, 2 pulados, 0 falhas** (a 1ª rodada pegou 3 falhas em `tests/integration/rate-limit-escrita.test.ts`, que lê a forma `const writeLimiter = rateLimit({`; a marca de verbos foi separada da declaração) |
| `npm run build` | exit 0 (`dist-server/server.cjs` 2,2 MB; `undici` fica externo, é dependência de produção) |
| suítes tocadas | `tests/seguranca/*` 122/122 + `ssrf-rebinding` 7/7; IA/STT/imagens 56/56; prontidão 19/19 |

## 8. Coordenação com os outros agentes

- `server/http/app.ts`. Três blocos novos: parser de query (l. 154), placar (l. 346) e tetos de leitura
  (l. 529-531). Quem mexer na ordem da montagem precisa manter os tetos específicos **antes** do
  `limitadorDeLeitura` geral.
- `server/routes/health.ts`. O `readyHandler` agora devolve um veredicto guardado por 5 s. Um teste que muda
  uma dependência entre duas chamadas precisa chamar `esquecerVereditoDeProntidao()`, como
  `tests/integration/prontidao.test.ts` faz.
- `package.json` e `package-lock.json`. `undici` passou a ser dependência direta (`^7.25.0`). A versão
  resolvida continua 7.29.0, a mesma que vinha pelo `jsdom`, e o `node_modules` compartilhado não mudou.
- **Perf backend.** O teto de leitura é 300/min por usuário, em memória. Se algum fluxo legítimo passar disso
  (por exemplo um jogo que pagina `/api/vocab/pagina` em laço), o ajuste é a constante
  `TETO_DE_LEITURA_POR_MINUTO` em `server/lib/limitesDeLeitura.ts`.
