# Lançamento — o passo a passo do dono

Este é o roteiro para colocar o Babel Play no ar pela primeira vez, na arquitetura aprovada em
24/09/2026: **Fly.io (GRU)**, SQLite no volume com **Litestream** para o **Cloudflare R2**, **Supabase Pro**
só para o login, **Cloudflare** na frente, **Resend**, **Sentry** e **UptimeRobot**; IA com **Groq** e
**OpenRouter** de reserva; cobrança pelo **Asaas**.

Tudo o que é código já está pronto e testado; o que falta são as **contas**, os **painéis** e as
**chaves**. Siga a ordem — cada passo usa o que o anterior criou. Nenhuma chave vai para o
repositório: segredo entra por `fly secrets set` ou pelos _secrets_ do GitHub.

> Onde cada variável vai e o que ela faz: [`.env.production.example`](../.env.production.example).
> O que fazer quando algo quebrar: [`docs/runbook.md`](runbook.md), seção 0.

Guarde, durante o caminho, um cofre de senhas (Bitwarden/1Password) com uma entrada por serviço:
login, 2FA, e as chaves geradas. **Ligue 2FA em todas as contas** — a conta do Fly ou do Cloudflare
comprometida é o app inteiro comprometido.

---

## Custo mensal

| peça                                                                         | plano                                    | custo estimado                                                      |
| ---------------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------- |
| Fly.io — máquina shared-cpu-1x 1 GB sempre ligada, GRU                       | pago por uso                             | ~US$ 5,70                                                           |
| Fly.io — volume 3 GB + snapshots do volume                                   | pago por uso                             | ~US$ 0,60                                                           |
| Fly.io — IPv4 dedicado (opcional; o compartilhado basta atrás do Cloudflare) | —                                        | US$ 0 (ou US$ 2)                                                    |
| Supabase Pro (projeto em sa-east-1, sem pausa, backup do Auth)               | Pro                                      | US$ 25                                                              |
| Cloudflare — DNS, WAF gerenciado básico, 1 regra de rate limit, HTTPS        | Free                                     | US$ 0                                                               |
| Cloudflare R2 — áudios, pesos dos modelos, réplica e snapshots (≈ 5–15 GB)   | pago por uso (10 GB grátis, egress zero) | ~US$ 0–0,30                                                         |
| Resend — e-mails de login (3.000/mês grátis)                                 | Free                                     | US$ 0                                                               |
| Sentry — erros (5 mil eventos/mês)                                           | Developer                                | US$ 0                                                               |
| UptimeRobot — monitor HTTP + heartbeat + página de status                    | Free                                     | US$ 0                                                               |
| Domínio `.com.br` (Registro.br, R$ 40/ano)                                   | —                                        | ~R$ 3,33                                                            |
| Groq + OpenRouter                                                            | pré-pago / teto no painel                | **variável, com teto** (ver `AI_BUDGET_USD_MONTH`)                  |
| **Fixo**                                                                     |                                          | **≈ US$ 31–34 + R$ 3,33 ≈ R$ 180–215/mês** (câmbio de R$ 5,60–6,20) |

O Asaas não tem mensalidade: cobra por transação (cartão ~R$ 0,49 + 1,99 % a 2,99 %; Pix ~R$ 0,99).

---

## 1. Domínio (Registro.br) — 10 min

1. registro.br → registrar `babelplay.com.br` (ou o nome escolhido) com o **CNPJ** da empresa (o
   contador abre a ME no Simples; MEI não pode ter SaaS).
2. Ainda **não** mude os servidores DNS — isso é no passo 2.

## 2. Cloudflare (DNS, HTTPS, WAF, R2) — 40 min

1. Criar conta em cloudflare.com, **ligar 2FA**, "Add a site" → o domínio → plano **Free**.
2. No Registro.br, trocar os servidores DNS para os dois que o Cloudflare mostrar. Esperar o
   "Active" (minutos a algumas horas).
3. **SSL/TLS** → modo **Full (strict)**; **Edge Certificates** → _Always Use HTTPS_ e _HSTS_
   (max-age 6 meses, sem _preload_ no começo); _Minimum TLS_ 1.2.
4. **R2** → ativar (pede cartão; os primeiros 10 GB são grátis). Criar **quatro buckets**, todos
   com _location hint_ **South America** se oferecido:
   - `babel-midia` — áudios das sessões (privado);
   - `babel-litestream` — réplica contínua do banco (privado);
   - `babel-backups` — snapshots diários (privado) → _Settings → Object lifecycle rules_ →
     **apagar objetos com mais de 30 dias**;
   - `babel-modelos` — pesos dos modelos (**público**: _Settings → Custom Domains_ →
     `modelos.<domínio>`).
5. No bucket `babel-modelos` → _Settings → CORS policy_:
   ```json
   [
     {
       "AllowedOrigins": ["https://<domínio>", "https://www.<domínio>"],
       "AllowedMethods": ["GET", "HEAD"],
       "AllowedHeaders": ["*"],
       "MaxAgeSeconds": 86400
     }
   ]
   ```
   (O app sai com isolamento de origem ligado — COEP `credentialless` + Document-Isolation-Policy —
   para o WASM ter threads. Os pesos são baixados por `fetch` com CORS, então esta política de CORS é
   tudo o que o bucket precisa: `Cross-Origin-Resource-Policy` não é exigido. Sem o CORS, os modelos
   locais não carregam.)
6. **R2 → Manage API tokens** → criar **três tokens** "Object Read & Write", cada um restrito a UM
   bucket: `midia` (+ `backups`), `litestream`, `modelos`. Anotar _Access Key ID_, _Secret_ e o
   endpoint `https://<conta>.r2.cloudflarestorage.com`.
7. Publicar os pesos dos modelos, do seu computador (baixa do Hugging Face na revisão fixada,
   confere o sha256 de cada peso e sobe):
   ```bash
   S3_ENDPOINT=https://<conta>.r2.cloudflarestorage.com S3_ACCESS_KEY_ID=<token modelos> \
   S3_SECRET_ACCESS_KEY=<segredo> npx tsx scripts/modelos/publicar-no-r2.ts --bucket=babel-modelos
   ```
8. A WAF, a regra de rate limit e o cabeçalho de origem ficam para o passo 9 (precisam do app no ar).

## 3. Supabase Pro (login) — 30 min

1. supabase.com → conta com **2FA** → organização → plano **Pro** (US$ 25).
2. **New project** → região **South America (São Paulo) — sa-east-1** (não muda depois) → senha do
   banco forte no cofre (o app não usa o banco do Supabase, só o Auth).
3. **Authentication → Providers**: _Email_ ligado, _Confirm email_ ligado, senha mínima 8 com
   _leaked password protection_; **Google** ligado (Client ID/Secret criados no Google Cloud Console
   → APIs & Services → Credentials → OAuth client "Web", origem `https://<domínio>`, redirect
   `https://<projeto>.supabase.co/auth/v1/callback`).
4. **Authentication → Multi-Factor** → **TOTP ligado**.
5. **Authentication → URL Configuration**: _Site URL_ `https://<domínio>`; _Redirect URLs_
   `https://<domínio>/auth/callback` (e o do staging, se houver).
6. **Authentication → Rate limits**: manter os padrões; _e-mails por hora_ ajustar depois do SMTP.
7. **Settings → API Keys**: anotar a **URL do projeto**, a **anon/publishable key** (pública) e a
   **service_role/secret key** (secreta — só vai para o Fly). Confirmar em _JWT Keys_ que o projeto
   usa **chaves assimétricas (ES256)** — é o que o servidor verifica pelo JWKS.
8. **Organization → Legal Documents** → aceitar o **DPA** (ver `docs/lgpd/operadores.md`).

## 4. Resend (e-mail do login e do convite ao responsável) — 30 min

1. resend.com → conta com 2FA → **Domains → Add** `<domínio>` (região São Paulo se oferecida). O
   Resend mostra os registros a criar no **Cloudflare DNS** (todos com a nuvem **cinza**, _DNS only_):
   - **SPF**: um `MX` e um `TXT` no subdomínio `send.<domínio>` (`v=spf1 include:amazonses.com ~all`).
     O SPF vale para o _envelope_ (Return-Path) nesse subdomínio, por isso não mexe no SPF do
     domínio raiz, se já houver um.
   - **DKIM**: um `TXT` em `resend._domainkey.<domínio>` com a chave pública. É ele que prova que o
     e-mail saiu de quem controla o domínio.
   - **DMARC**: um `TXT` em `_dmarc.<domínio>`. Comece com `v=DMARC1; p=none; rua=mailto:<seu e-mail>`
     para receber os relatórios sem bloquear nada; depois de uma ou duas semanas sem falhas nos
     relatórios, suba para `p=quarantine`. Sem DMARC, Gmail e Yahoo tratam o remetente como suspeito.
     Clicar em _Verify_ e esperar os três ficarem **Verified** (minutos a algumas horas).
2. **Domains → `<domínio>` → Configuration**: **desligar _Click tracking_ e _Open tracking_**. O convite
   vai para o responsável de um menor; o servidor não rastreia abertura nem clique, e o Resend não
   deve reescrever o link nem inserir pixel. Aceitar o DPA.
3. **API Keys** → chave com permissão **Sending access** (só envio), restrita ao domínio. Guarde-a:
   vai para o Supabase (passo 4) e para o Fly (`RESEND_API_KEY`, passo 8).
4. No Supabase → **Authentication → SMTP Settings** → _Enable custom SMTP_: host `smtp.resend.com`,
   porta 465, usuário `resend`, senha = a chave, remetente `nao-responda@<domínio>`, nome "Babel Play".
5. **O convite ao responsável** (Fase 4: conta de menor de 16 anos fica sem nuvem até o responsável
   aceitar) sai pela **API HTTP** do Resend — `POST https://api.resend.com/emails`, em
   `server/lib/conviteDoResponsavel.ts` —, não pelo SMTP do Supabase, que só manda os modelos de login.
   Precisa de duas variáveis no Fly: `RESEND_API_KEY` (a chave do passo 3) e
   `EMAIL_REMETENTE="Babel Play <nao-responda@<domínio>>"`, mais `APP_URL=https://<domínio>`, que
   torna o link absoluto. Sem as duas, o convite só é registrado no log e o boot mostra
   `[convite] AVISO: ... nenhuma conta de menor de 16 anos consegue liberar a nuvem`.
   Como o envio se comporta:
   - e-mail em pt-BR, texto + HTML mínimo: quem pediu (o nome que a conta informou), o que o
     responsável autoriza, o link, a validade (**7 dias**) e que basta ignorar para recusar — sem
     imagem, sem link além do convite, sem o e-mail do responsável no corpo;
   - cada tentativa tem **8 s** de prazo e há no máximo **duas** (só em 5xx, 429, rede ou timeout;
     a mesma `Idempotency-Key` impede e-mail duplicado); 4xx é definitivo;
   - se o envio falha, a tela diz "não conseguimos enviar agora, tente de novo em alguns minutos", o
     convite novo é descartado e o anterior (se havia) continua valendo; o log registra
     `convite_email_falhou`/`convite_nao_enviado` com o status e o texto do provedor **redigidos**,
     nunca o destinatário;
   - no máximo **5 convites por conta em 24 h** (429 `limite_de_convites`), para a rota não virar canal
     de spam com o domínio do app.

## 5. Groq e OpenRouter (IA) — 20 min

**Groq (principal):** console.groq.com → conta com 2FA → **Billing** → plano pago com **spend limit
mensal** (ex.: US$ 30) e alerta em 80 % → **Settings → Data controls → Zero Data Retention: ligado**
→ **API Keys** → criar a chave `babel-play-producao`.

**OpenRouter (reserva):** openrouter.ai → conta com 2FA → **Credits**: comprar crédito
**pré-pago** (ex.: US$ 10) com **auto top-up DESLIGADO** → **Settings → Privacy**: _"Zero data
retention"_ e _"Disable training"_ ligados (roteia só para provedores ZDR) → **Keys** → criar a
chave com **credit limit** (ex.: US$ 10).

Decida o **orçamento global** `AI_BUDGET_USD_MONTH` (soma do que aceita gastar nos dois; sem ela o
app usa US$ 20). O servidor estima o gasto de cada chamada (`server/lib/orcamentoDeIa.ts`): a 80 %
sai o evento `ia_orcamento_alerta_80` e a 100 % o `ia_orcamento_esgotado` — a IA de nuvem fecha
sozinha até o mês virar e o app volta para os modelos locais. Os dois chegam ao Sentry; a regra de
alerta está no passo 7.

## 6. Asaas (cobrança, conta PJ) — 1 a 3 dias úteis de aprovação

1. asaas.com → abrir conta **PJ** com o CNPJ → enviar documentos → esperar aprovação.
2. Aprovada: **Integrações → Chave de API** → gerar a chave de **produção** (começa com
   `$aact_prod_`).
3. **Integrações → Webhooks** → novo webhook: URL `https://<domínio>/api/billing/webhook/asaas`,
   versão v3, eventos de **cobrança** e de **assinatura**, _authToken_ = um segredo que você gera
   (`node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`) → é o
   `ASAAS_WEBHOOK_TOKEN`. Fila de sincronização **ligada**.
4. Configurar a emissão de **NFS-e** (obrigatória no padrão nacional a partir de 01/11/2026) com o
   contador.

## 7. Sentry e UptimeRobot — 20 min

**Sentry:** sentry.io → organização (região **EU** ou US) → plano Developer → **2 projetos**:
`babel-play-servidor` (plataforma Node) e `babel-play-navegador` (Browser JavaScript). Em cada um,
**Settings → Security & Privacy**: _Prevent Storing of IP Addresses_ **ligado**, _Data Scrubber_
**ligado**, _Use Default Scrubbers_ **ligado**. Anotar os dois **DSN**. Em **Alerts**: e-mail em
issue nova, e uma regra no projeto do servidor para `tags.event` igual a `ia_orcamento_alerta_80`,
`ia_orcamento_esgotado` ou `backup_diario_falhou` → e-mail imediato. Aceitar o DPA.

**UptimeRobot:** uptimerobot.com → conta → três itens:

1. _Monitor HTTP(s)_ em `https://<domínio>/api/ready`, a cada 5 min, alerta por e-mail (e app);
2. _Monitor Heartbeat_ com intervalo de **1 dia** e tolerância de 1 h → anotar a URL: é o
   `BACKUP_HEARTBEAT_URL`;
3. _Status page_ pública com o monitor HTTP (link no rodapé do app/Termos).

No GitHub → _Settings → Secrets and variables → Actions → Variables_ → `HEALTH_URL =
https://<domínio>/api/health` (liga o `uptime.yml`, o segundo par de olhos, que abre issue quando cai).

## 8. Fly.io — o app no ar — 40 min

1. fly.io → conta com **2FA** → cartão → instalar o `flyctl` e `fly auth login`.
2. Criar o app, o volume e os segredos (os valores vêm dos passos anteriores; a lista completa e
   comentada está no `.env.production.example`):
   ```bash
   fly apps create babel-play
   fly volumes create babel_dados --app babel-play --region gru --size 3
   fly secrets set --app babel-play \
     SECRET_KEY=... ORIGEM_SEGREDO=... \
     SUPABASE_URL=https://<projeto>.supabase.co SUPABASE_SERVICE_ROLE_KEY=... \
     ASAAS_BASE_URL=https://api.asaas.com/v3 ASAAS_API_KEY=... ASAAS_WEBHOOK_TOKEN=... \
     S3_ENDPOINT=... S3_BUCKET=babel-midia S3_ACCESS_KEY_ID=... S3_SECRET_ACCESS_KEY=... \
     BACKUP_S3_BUCKET=babel-backups BACKUP_HEARTBEAT_URL=... \
     LITESTREAM_BUCKET=babel-litestream LITESTREAM_ENDPOINT=... \
     LITESTREAM_ACCESS_KEY_ID=... LITESTREAM_SECRET_ACCESS_KEY=... \
     LLM_BASE_URL=https://api.groq.com/openai/v1 LLM_API_KEY=... LLM_MODEL=openai/gpt-oss-120b \
     LLM_RESERVA_BASE_URL=https://openrouter.ai/api/v1 LLM_RESERVA_API_KEY=... LLM_RESERVA_MODEL=openai/gpt-oss-120b \
     AI_BUDGET_USD_MONTH=40 APP_URL=https://<domínio> SENTRY_DSN=... \
     RESEND_API_KEY=... EMAIL_REMETENTE="Babel Play <nao-responda@<domínio>>"
   ```
   Gere `SECRET_KEY` e `ORIGEM_SEGREDO` com
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` e guarde **as duas no
   cofre**: perder a `SECRET_KEY` torna ilegíveis as chaves de API que os usuários guardaram.
3. `fly tokens create deploy --app babel-play` → no GitHub, _Settings → Environments →_
   **production** (com _Required reviewers_ = você) → _secret_ `FLY_API_TOKEN` e as _variables_
   `FLY_APP=babel-play`, `URL_PUBLICA=https://<domínio>`, `VITE_SUPABASE_URL`,
   `VITE_SUPABASE_ANON_KEY`, `VITE_SELF_HOST_MODELS=https://modelos.<domínio>`, `VITE_SENTRY_DSN`
   (o do projeto do navegador). Repita com um app `babel-play-staging` no environment **staging**.
4. `fly ips allocate-v6 --app babel-play` (o IPv4 compartilhado já vem).
5. GitHub → _Actions_ → **Deploy (Fly.io)** → _Run workflow_ → destino `staging-e-producao` (ou
   `staging` e depois `producao`: produção só aceita commit com o selo `deploy/staging`). Cada
   ambiente constrói a imagem do commit, tira snapshot do volume, implanta, confere `/api/ready` e a
   versão, e volta sozinho para a imagem anterior se a fumaça falhar (`docs/deploy-checklist.md`).
6. `fly logs --app babel-play` deve mostrar `[iniciar] Litestream: replicação contínua ligada`,
   `[backup] snapshot diário às 6h UTC`, `[sentry] erros do servidor vão para o Sentry` — e nenhum
   `ABORTADO`.

## 9. Cloudflare apontando para o Fly, e a borda fechada — 20 min

1. `fly certs add <domínio> --app babel-play` (e `www.<domínio>`) → o Fly mostra o registro de
   validação → criar no DNS do Cloudflare o `CNAME <domínio> → babel-play.fly.dev` com a **nuvem
   laranja (proxied)** e o `_acme-challenge` que o Fly pedir (nuvem cinza). `fly certs check` até ficar OK.
2. **Rules → Transform Rules → Modify Request Header** → "Set static" `x-origem-segredo` =
   o `ORIGEM_SEGREDO` → aplicar a todas as requisições do domínio. A partir daqui quem chega por
   `babel-play.fly.dev` recebe 403 (as sondas `/api/health` e `/api/ready` continuam passando).
3. **Security → WAF → Managed rules**: ligar o conjunto gratuito. **Security → Bots**: _Bot Fight
   Mode_ ligado.
4. **Security → WAF → Rate limiting rules** (1 regra no Free): "se o caminho começa com `/api/` e
   o mesmo IP passa de **300 requisições em 10 s** → bloquear por 10 s". É a rede de fora; os limites
   finos por usuário estão no servidor.
5. **Caching → Configuration**: _Browser Cache TTL_ = **Respect Existing Headers** (o servidor já
   manda `immutable` nos assets e `no-cache` no `index.html`).

## 10. Conferências antes de abrir — 30 min

- [ ] `https://<domínio>/api/ready` responde 200; `https://babel-play.fly.dev/` responde 403.
- [ ] Criar uma conta de teste, confirmar o e-mail (chega pelo Resend), entrar, **ativar o 2FA** em
      Ajustes → Conta, sair e entrar de novo (o app pede o código).
- [ ] Gravar uma sessão curta: o áudio aparece no bucket `babel-midia`.
- [ ] **Threads do WASM**: no Chrome ou no Firefox, console da página → `crossOriginIsolated` dá
      `true` (`curl -sI https://<domínio>/` mostra `cross-origin-embedder-policy: credentialless` e
      `document-isolation-policy`). Se algum recurso de terceiro parar de carregar por causa do COEP,
      `CROSS_ORIGIN_ISOLATION=dip` (no `[env]` do `fly.toml`, ou `fly secrets set` para valer sem
      novo deploy) mantém as threads no Chrome/Edge; `0` desliga.
- [ ] No dia seguinte: `backups/diario/<data>.db.gz` no `babel-backups`, heartbeat verde no UptimeRobot.
- [ ] **Restaurar o Litestream** num arquivo à parte (runbook §0.2-A) e anotar a data no runbook.
- [ ] Rodar o **ZAP Baseline** (Actions → _ZAP Baseline (staging)_ com a URL do staging) e triar.
- [ ] **Cobrança real de R$ 5** no seu cartão pelo fluxo do app, conferir o plano liberado pelo
      webhook, e **estornar** no painel do Asaas.
- [ ] Forçar um erro de teste e ver o evento no Sentry **sem** e-mail nem IP.
- [ ] Aceitar os DPAs e marcar `docs/lgpd/operadores.md`; atualizar a política de privacidade com os
      operadores novos (a lista está lá).
- [ ] Ligar alerta de fatura no Fly, no Supabase e no Sentry.
- [ ] **Convite ao responsável por e-mail** (passo 4.5): `fly logs` **sem** `[convite] AVISO`; testar
      com uma conta de 15 anos — o e-mail chega (caixa de entrada, não spam; nos cabeçalhos,
      `spf=pass`, `dkim=pass` e `dmarc=pass`), o link não foi reescrito pelo Resend, o responsável
      aceita e a conta libera a nuvem. **Sem isso, não abra para menores.**
- [ ] Testar as três chaves de emergência no staging: `AI_ENABLED=0` (tradução cai para o local),
      `CHECKOUT_ENABLED=0` (assinar responde 503 com mensagem), `SIGNUP_ENABLED=0` (conta nova recebe
      `cadastro_fechado`; desligar também o cadastro no painel do Supabase).

## 11. Rotina depois do lançamento

| quando           | o quê                                                                                              |
| ---------------- | -------------------------------------------------------------------------------------------------- |
| todo dia útil    | olhar o Sentry (issues novas) e o gasto de IA (`GET /api/admin/ia` com token de admin)             |
| toda semana      | revisar e aplicar os PRs do Dependabot (CI verde → deploy staging → production)                    |
| todo mês         | restaurar o Litestream à mão (runbook §0.2-A) e anotar; conferir as faturas contra esta tabela     |
| a cada trimestre | `node scripts/modelos/revisoes.mjs` (modelos novos no Hub?); revisar a RoPA (`docs/lgpd/ropa.csv`) |

Chaves de emergência (runbook §0), todas por `fly secrets set NOME=0 --app babel-play` (a máquina
reinicia em ~20 s; volte com `1`):

| chave                       | efeito                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------ |
| `AI_ENABLED=0`              | desliga toda IA de nuvem (tradução, transcrição, tutor); o app segue com os modelos locais |
| `CHECKOUT_ENABLED=0`        | fecha assinar e comprar; quem já paga segue com o plano                                    |
| `SIGNUP_ENABLED=0`          | recusa contas novas (`cadastro_fechado`); desligue também o cadastro no Supabase           |
| `AI_BUDGET_USD_MONTH=<US$>` | o teto do mês; alerta em 80 %, fecha a nuvem em 100 %                                      |
