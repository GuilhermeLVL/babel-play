# Guia do dono: o que só você pode fazer, na ordem

Escrito em 27/10/2026. É o roteiro **ordenado e executável sozinho** para tudo o que depende de conta, painel, chave,
contrato ou decisão sua. O código está pronto; o que falta é isto.

Este guia **não repete** o detalhe técnico: aponta para a fonte. Se um número ou nome divergir, **o código vence**
(`server/lib/config.ts`, `src/core/planos.ts`, `wrangler.jsonc`). Fontes: [`LANCAMENTO.md`](LANCAMENTO.md) (§1–§11-bis),
[`runbook.md`](runbook.md) (§0.6), [`deploy.md`](deploy.md), [`flags.md`](flags.md), [`STAGING.md`](STAGING.md),
[`ESTADO-DO-LANCAMENTO.md`](ESTADO-DO-LANCAMENTO.md), [`.env.production.example`](../.env.production.example),
[`lgpd/operadores.md`](lgpd/operadores.md), [`livros-catalogo.md`](livros-catalogo.md),
[`livros-classificacao-sugestoes.md`](livros-classificacao-sugestoes.md).

> **Regras de ouro.** (1) Ligue **2FA** em toda conta; a conta da Cloudflare comprometida é o app inteiro
> comprometido. (2) Guarde no cofre de senhas (Bitwarden/1Password) uma entrada por serviço. (3) **Nenhuma chave vai
> para o git**: segredo só em `.secrets.production.json` (ignorado pelo git), nos _secrets_ do GitHub ou nos secrets do
> Worker. (4) Cole chaves **sem** passá-las na linha de comando (aparecem no histórico do shell); use o prompt
> interativo dos comandos `gh secret set` e `wrangler secret put`.

> ⚠️ confirmar (vale para o guia todo): os painéis mudam de nome e de lugar. Os links abaixo levam à página raiz ou
> à documentação oficial; quando o caminho de menu for uma memória e não um fato verificado, está marcado.

---

## Mapa de dependências e ordem recomendada

```
FASE 0  Preparação (cofre, 2FA, contador/ME, CNPJ)
   │
FASE A  CAMINHO CRÍTICO — abrir a produção
   A1 NS no Registro.br ──► A3 Resend (DNS) ──► A10 Domínio no Worker ──► A12 Passeio + conferências ──► A13 Abrir portas
   A2 Supabase  ───────────────┐                       ▲
   A4 IA (OpenRouter/Groq) ────┤                       │
   A5 Asaas (precisa CNPJ) ────┼──► A8 Environment ──► A9 .secrets.production.json ──► A10 deploy (2 runs)
   A6 Sentry/UptimeRobot/Turnstile ┤
   A7 R2: chaves S3 e backup ──┘
   A11 e-mail contato / política de privacidade / DPAs  (pode ir em paralelo; precisa estar pronto antes de A13)
FASE B  Anúncios (só depois da Fase A estável): jurídico ECA + rede + Worker frasy-anuncios
FASE C  O resto: guias, livros, parceiro de leitura, decisões de produto
```

**Ordem recomendada em dias** (os prazos externos são o gargalo, então comece pelo que demora):

| quando       | faça                                                                                                                    |
| ------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Dia 1 (hoje) | A1 (trocar NS: propaga sozinho), Fase 0 (pedir ao contador a ME/CNPJ e a NFS-e), A2, A4, A7, A15 (apagar Worker antigo) |
| Dia 1–3      | A5 (Asaas PJ: aprovação leva 1 a 3 dias úteis), A3 (Resend assim que a zona estiver Ativa), A6                          |
| Dia 2–4      | A8, A9, A10 (deploy) e A11 (política, DPAs, contato)                                                                    |
| Dia 4–5      | A12 (passeio no staging + conferências) e A13 (abrir portas, uma por vez)                                               |
| Depois       | Fase B (anúncios), Fase C (guias, livros, decisões)                                                                     |

**Prazos externos que não dependem de você:** propagação de NS (minutos a horas), aprovação do Asaas PJ (1 a 3 dias
úteis), verificação do domínio no Resend (minutos a horas), aprovação da rede de anúncios (dias a semanas),
**NFS-e padrão nacional obrigatória a partir de 01/11/2026**.

---

## Checklist mestre

**Fase 0 e A (abre a produção)**

- [ ] 0. Cofre de senhas, 2FA, contador (ME no Simples, CNPJ, NFS-e)
- [ ] A1. NS da zona `frasy.com.br` trocados no Registro.br e zona **Ativa**
- [ ] A2. Supabase Pro: redirects, cadastro desligado, PITR, projeto separado para o staging
- [ ] A3. Resend: domínio verificado (SPF/DKIM/DMARC), tracking desligado, chave de envio, SMTP no Supabase
- [ ] A4. Chaves de IA pagas (OpenRouter e Groq) com teto e retenção zero
- [ ] A5. Asaas PJ: aprovada, chave sandbox + produção, webhook, nenhuma assinatura antiga (R$ 39,90 / R$ 179)
- [ ] A6. Sentry (2 DSNs), UptimeRobot (monitor + `HEALTH_URL`), Turnstile (site key + Supabase)
- [ ] A7. R2: chaves S3 (backup e Environment `restauracao`), domínio `modelos.frasy.com.br`
- [ ] A8. GitHub Environment `production` com secrets e variables
- [ ] A9. `.secrets.production.json` preenchido e enviado por `scripts/cloudflare/secrets.ts`
- [ ] A10. Deploy da produção (2 runs), domínio no Worker, cabeçalho de origem, WAF, rate limit
- [ ] A11. Política de privacidade (campos `[DONO]`), DPAs, `contato@frasy.com.br`, advogado (Termos §3–§4)
- [ ] A12. Passeio manual no staging (com console aberto), Safari, conferências do LANCAMENTO §10
- [ ] A13. Abrir as portas, uma por vez (`SIGNUP_ENABLED` → `CHECKOUT_ENABLED` → `ANUAL_ENABLED`)
- [ ] A14. Alertas de fatura (Cloudflare, Supabase, Sentry)
- [ ] A15. Apagar o Worker antigo `babel-play`

**Fase B (anúncios)**

- [ ] B1. Consulta jurídica sobre o ECA Digital
- [ ] B2. Rede de anúncios (AdSense ou Ad Manager) aprovada com o domínio próprio
- [ ] B3. Worker `frasy-anuncios` em `ads.frasy.com.br` + `ANUNCIOS_ORIGEM` + `VITE_ANUNCIOS_ORIGEM`
- [ ] B4. Ligar a flag `anuncios` (e conferir)

**Fase C (o resto)**

- [ ] C1. Revisar os 12 guias (`revisado: false` → `true`)
- [ ] C2. Aprovar a classificação etária dos livros
- [ ] C3. Enviar o Gutenberg curado ao R2 de produção
- [ ] C4. Decidir quando ligar a flag `parceiro_de_leitura`
- [ ] C5. Decisões de produto (Parakeet em inglês, reconhecimento local do Chrome, pool da amostra grátis, alerta `billing_parcela_ambigua`, `voz_natural`, Ao Vivo, e-mails do Asaas)

---

# FASE 0 — Preparação

## 0. Cofre, 2FA, contador

- **Objetivo:** ter onde guardar chaves e ter o CNPJ (o Asaas PJ e a política de privacidade pedem).
- **Pré-requisito:** nenhum.
- **Passos:**
  1. Crie o cofre (Bitwarden/1Password) com uma pasta "Frasy" e uma entrada por serviço: login, 2FA, chaves geradas.
  2. Fale com o **contador** (MEI não pode ter SaaS): abrir **ME no Simples Nacional** e configurar a **NFS-e padrão
     nacional**, obrigatória a partir de **01/11/2026** ([portal da NFS-e](https://www.gov.br/nfse/pt-br)).
  3. Anote **razão social** e **CNPJ**: entram na política de privacidade (A11) e no Asaas (A5).
- **Como conferir:** você tem o CNPJ em mãos.
- **Destrava:** A5 (Asaas PJ), A11 (política de privacidade).

> Se o CNPJ ainda não existe, tudo o que não depende dele (A1, A2, A3, A4, A6, A7, A9–A10 em staging) pode andar; a
> venda (A13, passo de `CHECKOUT_ENABLED`) só abre depois do Asaas PJ aprovado.

---

# FASE A — Caminho crítico: abrir a produção

## A1. Trocar os servidores DNS (NS) no Registro.br

- **Objetivo:** a Cloudflare passar a responder pelo `frasy.com.br`. A zona já foi criada (plano Free; SSL em modo
  _strict_, HTTPS sempre, TLS mínimo 1.2) e está esperando os NS.
- **Pré-requisito:** acesso ao [Registro.br](https://registro.br/) com a titularidade do domínio.
- **Passos:**
  1. Entre em [registro.br](https://registro.br/) → **Painel** → o domínio `frasy.com.br` → **DNS** → **Alterar
     servidores DNS** (⚠️ confirmar o nome exato do botão).
  2. Escolha usar servidores DNS próprios/externos e informe **exatamente estes dois**:
     - `john.ns.cloudflare.com`
     - `monroe.ns.cloudflare.com`
  3. Remova os servidores antigos (a Cloudflare exige que só os dois dela fiquem) e salve.
  4. Abra o [painel da Cloudflare](https://dash.cloudflare.com/) → a zona `frasy.com.br` → **Overview**. Espere o
     status **Active** (minutos a algumas horas). Se estiver "Pending", use "Check nameservers now".
  5. Não crie nenhum registro DNS manualmente para o app: o passo A10 cria o DNS do Worker sozinho.
- **Como conferir:** `dig NS frasy.com.br +short` mostra `john.ns.cloudflare.com.` e `monroe.ns.cloudflare.com.`; a
  zona aparece **Active** no painel.
- **Destrava:** A3 (os registros do Resend vão no DNS da Cloudflare), A10 (domínio no Worker), A11 (Email Routing).
- **Depende de:** nada. **Faça primeiro, é o que mais demora para propagar.**
- Referência: [LANCAMENTO.md §2](LANCAMENTO.md), docs da Cloudflare sobre [trocar nameservers](https://developers.cloudflare.com/dns/zone-setups/full-setup/setup/).

## A2. Supabase: Pro, redirects, cadastro desligado, PITR, staging separado

- **Objetivo:** login e banco de produção prontos, com o cadastro **fechado** até você abrir.
- **Pré-requisito:** conta no [Supabase](https://supabase.com/dashboard) com 2FA. O projeto de produção está em
  `sa-east-1` (São Paulo; a região não muda depois).
- **Passos:**
  1. [Dashboard](https://supabase.com/dashboard) → Organization → **Billing** → plano **Pro** (US$ 25/mês: sem pausa,
     backups do Auth).
  2. **Authentication → URL Configuration**: _Site URL_ = `https://frasy.com.br`; _Redirect URLs_ =
     `https://frasy.com.br/auth/callback` (acrescente o do staging só no projeto do staging, ver passo 7).
  3. **Authentication → Providers → Email**: _Confirm email_ ligado; **desligue _Allow new users to sign up_ agora**
     (você liga no passo A13). Google: só se for usar; senão defina `VITE_LOGIN_GOOGLE=0` no Environment (A8).
  4. **Authentication → Multi-Factor**: TOTP ligado. **JWT Keys**: confirme chaves assimétricas (ES256).
  5. **Settings → API Keys**: anote a **URL do projeto**, a **anon/publishable key** (pública, vai para `VITE_SUPABASE_ANON_KEY`)
     e a **service_role/secret key** (secreta, só em `.secrets.production.json`).
  6. **Database → Backups → PITR** (add-on pago; opcional, mas recomendado com dados de menores). ⚠️ confirmar o preço e o
     caminho do menu no painel.
  7. **Staging com projeto separado (R11)**: hoje o staging divide o Auth com a produção. Crie um **segundo projeto**
     (pode ser no plano Free) só para o staging, repita os passos 2 e 5 com o domínio do staging
     (`https://frasy-staging.guigui-cruzeiro.workers.dev`), e depois troque `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`/
     `VITE_SUPABASE_*` do ambiente staging. ⚠️ confirmar: o banco `frasy_staging` já existe no projeto atual; decida se
     o projeto novo traz só o Auth ou também o Postgres (ver `docs/auditoria/2026-10-21-fase5-portao-g1.md`, R11).
  8. **Organization → Legal Documents**: aceite o **DPA** (A11).
  9. Para as variáveis `DATABASE_URL_MIGRACAO` e `SUPABASE_CA_PEM` (usadas em A8): **Connect** → string do **pooler de
     sessão** (`aws-1-sa-east-1.pooler.supabase.com:5432`, usuário `postgres.<ref>`) com `?sslmode=verify-full`, e o
     certificado CA em **Database → Settings → SSL Configuration → Download certificate**. ⚠️ confirmar o caminho do menu.
- **Como conferir:** em _URL Configuration_ aparecem os dois endereços; _Allow new users to sign up_ está **desligado**;
  _Billing_ mostra Pro.
- **Destrava:** A8, A9, A13 (passo do cadastro).
- Referência: [LANCAMENTO.md §3](LANCAMENTO.md), [docs do Supabase Auth](https://supabase.com/docs/guides/auth).

## A3. Resend: e-mail do login e do convite ao responsável

- **Objetivo:** e-mails de confirmação e o **convite ao responsável** chegando na caixa de entrada (sem isso não se abre
  para menores).
- **Pré-requisito:** A1 (zona **Ativa**).
- **Passos:**
  1. [Resend → Domains](https://resend.com/domains) → **Add Domain** `frasy.com.br`. Ele lista os registros: crie-os no
     DNS da Cloudflare ([dash](https://dash.cloudflare.com/) → zona → **DNS → Records**) **com a nuvem cinza (DNS only)**:
     SPF (`MX` e `TXT` em `send.frasy.com.br`), DKIM (`TXT` em `resend._domainkey.frasy.com.br`) e DMARC (`TXT` em
     `_dmarc.frasy.com.br`, comece com `v=DMARC1; p=none; rua=mailto:<seu e-mail>`). Clique **Verify**.
  2. Domínio → **Configuration**: **desligue _Click tracking_ e _Open tracking_** (o convite vai para o responsável de
     um menor; o link não pode ser reescrito).
  3. [API Keys](https://resend.com/api-keys) → nova chave **Sending access**, restrita ao domínio. Guarde no cofre.
  4. Supabase → **Authentication → SMTP Settings** → _Enable custom SMTP_: host `smtp.resend.com`, porta `465`, usuário
     `resend`, senha = a chave, remetente `nao-responda@frasy.com.br`, nome `Frasy`.
  5. Aceite o DPA do Resend.
  6. Para `.secrets.production.json` (A9): `RESEND_API_KEY`, `EMAIL_REMETENTE="Frasy <nao-responda@frasy.com.br>"`,
     `APP_URL=https://frasy.com.br`.
  7. Depois de abrir o cadastro (A13), suba o DMARC para `p=quarantine` quando os relatórios de 1–2 semanas estiverem limpos.
- **Como conferir:** os 3 registros ficam **Verified**; um e-mail de teste chega na caixa de entrada com `spf=pass`,
  `dkim=pass`, `dmarc=pass` nos cabeçalhos.
- **Destrava:** convite ao responsável (conferência do §10), login por e-mail.
- Referência: [LANCAMENTO.md §4](LANCAMENTO.md).

## A4. Chaves de IA pagas

- **Objetivo:** a IA de nuvem da produção, com **teto de gasto** e **retenção zero**. Gemini é proibido (termos vedam
  menores). A Groq está sem créditos hoje: o OpenRouter é a rota principal; mantenha uma reserva.
- **Pré-requisito:** nenhum (cartão de crédito).
- **Passos:**
  1. [OpenRouter](https://openrouter.ai/settings/credits): conta com 2FA → compre crédito **pré-pago** (ex.: US$ 10) com
     **auto top-up desligado** → [Settings → Privacy](https://openrouter.ai/settings/privacy): ligar _Zero data retention_
     e _Disable training_ → [Keys](https://openrouter.ai/settings/keys): chave com **credit limit**.
  2. [Groq Console](https://console.groq.com/) (reserva/STT): Billing com **spend limit mensal** e alerta em 80 %; _Data
     controls → Zero Data Retention_ ligado; chave `babel-play-producao`.
  3. Decida o orçamento global: `AI_BUDGET_USD_MONTH` (sugerido **40**) e `AI_BUDGET_USD_DAY` (sugerido **4**), como no
     `.env.production.example`. Alerta em 80 %, a nuvem fecha em 100 %.
  4. Escolha o registro de provedores: `IA_PROVEDORES_ARQUIVO=ops/ia-provedores.openrouter.json` (ou `IA_PROVEDORES`).
     Em produção o boot **aborta** se o registro citar Gemini ou provedor sem `"retencao": "zdr"`: confirme a retenção
     zero no painel de cada provedor antes de declarar.
  5. Opcional: tetos por conta nos planos pagos (`TETO_USD_MES_PLUS`, `TETO_USD_MES_FAMILIA`, `TETO_USD_MES_PRO4`,
     comentados no `.env.production.example`): escolha os números (decisão aberta #10).
- **Como conferir:** o boot do Worker não mostra `ia_sem_reserva` nem `ABORTADO` (`npx wrangler tail -c wrangler.jsonc`);
  depois do deploy, `GET /api/admin/ia` (token de admin) mostra o gasto.
- **Destrava:** A9 (`OPENROUTER_API_KEY`, `LLM_*`, `AI_BUDGET_USD_*`), a IA de estudo.
- Referência: [LANCAMENTO.md §5](LANCAMENTO.md), [alternativas-de-custo-e-eficiencia.md](alternativas-de-custo-e-eficiencia.md).

## A5. Asaas (cobrança, conta PJ)

- **Objetivo:** cobrança real funcionando, e o webhook concedendo o plano pelo valor pago.
- **Pré-requisito:** Fase 0 (CNPJ).
- **Passos:**
  1. [asaas.com](https://www.asaas.com/) → abrir conta **PJ** com o CNPJ → enviar documentos → esperar aprovação (1 a 3
     dias úteis). Em paralelo, crie a conta de **sandbox** em [sandbox.asaas.com](https://sandbox.asaas.com/) (o staging usa
     a chave de sandbox, com `ASAAS_SANDBOX=1` e `ASAAS_BASE_URL=https://api-sandbox.asaas.com/v3`; **nunca**
     `ASAAS_SANDBOX` na produção).
  2. Aprovada: **Integrações → Chave de API** → gere a chave de **produção** (`ASAAS_API_KEY`). Nunca cole no chat nem no git.
  3. **Integrações → Webhooks** → novo webhook: URL `https://frasy.com.br/api/billing/webhook/asaas`, versão v3, eventos de
     **cobrança** e de **assinatura**, _authToken_ = segredo gerado por você (`openssl rand -hex 24`) que vira
     `ASAAS_WEBHOOK_TOKEN`; fila de sincronização **ligada**. (Crie o webhook depois do A10, quando o domínio responder.)
  4. Confira que **juros e multa** da conta estão **zerados** (o valor pago é o que decide plano e ciclo).
  5. **Confira que não existe assinatura antiga a R$ 39,90 nem a R$ 179,00**: no painel, na lista de assinaturas/cobranças,
     filtre por esses valores. Se existir, cancele ou migre antes de abrir a venda (o webhook concede plano pelo valor,
     e R$ 39,90 era o preço do Ao Vivo). ⚠️ confirmar o nome do menu no painel do Asaas.
  6. **E-mails de cobrança do Asaas ao cliente** (decisão #1): [asaas-notificacoes.md](asaas-notificacoes.md) manda ligar;
     [lgpd/operadores.md](lgpd/operadores.md) manda desligar "se o app já avisa". Escolha uma e registre.
  7. **NFS-e**: emissão configurada com o contador (obrigatória em 01/11/2026).
  8. Pix Automático fica **desligado** (exige CNPJ ativo há 6 meses ou mais).
  9. Aceite o DPA do Asaas (A11).
- **Como conferir:** o histórico do webhook no painel mostra entregas com 200 depois do primeiro teste (A12); a chave
  de produção começa com `$aact_prod_`.
- **Destrava:** A9 (`ASAAS_*`), a conferência da cobrança real de R$ 5 (A12) e `CHECKOUT_ENABLED` (A13).
- Referência: [LANCAMENTO.md §6](LANCAMENTO.md), [docs do Asaas](https://docs.asaas.com/).

## A6. Sentry, UptimeRobot, Turnstile

- **Objetivo:** ver erros, ser avisado quando cair, e barrar robôs no cadastro.
- **Pré-requisito:** nenhum (Turnstile precisa da conta Cloudflare).
- **Sentry** ([sentry.io](https://sentry.io/)):
  1. Organização (região EU ou US) → plano Developer → **2 projetos**: `babel-play-servidor` (Node) e
     `babel-play-navegador` (Browser JavaScript).
  2. Em cada um, **Settings → Security & Privacy**: _Prevent Storing of IP Addresses_, _Data Scrubber_ e _Use Default
     Scrubbers_ **ligados**.
  3. Anote os dois **DSN**: o do servidor vira `SENTRY_DSN` (secret do Worker, A9); o do navegador vira `VITE_SENTRY_DSN`
     (variable do Environment, A8).
  4. **Alerts**: e-mail em issue nova, e regra no projeto do servidor para `tags.event` igual a `ia_orcamento_alerta_80`
     ou `ia_orcamento_esgotado`. Adicione também alertas para `billing_parcela_ambigua` (decisão C5). Aceite o DPA.
- **UptimeRobot** ([uptimerobot.com](https://uptimerobot.com/dashboard)):
  1. _Monitor HTTP(s)_ em `https://frasy.com.br/api/ready`, a cada 5 min, alerta por e-mail (e app).
  2. _Status page_ pública com o monitor (link no rodapé/Termos).
  3. No GitHub: [Settings → Secrets and variables → Actions → Variables](https://github.com/GuilhermeLVL/babel-play/settings/variables/actions)
     → variável `HEALTH_URL` = `https://frasy.com.br/api/health` (liga o workflow `uptime.yml`).
- **Turnstile** ([docs](https://developers.cloudflare.com/turnstile/)):
  1. Cloudflare dash → **Turnstile** → _Add widget_ para `frasy.com.br` (modo _Managed_). Anote **site key** e **secret key**.
  2. A site key vai para a variable `VITE_TURNSTILE_SITE_KEY` do Environment (A8).
  3. No Supabase → **Authentication → Attack Protection → CAPTCHA protection**: provedor Turnstile, cole a secret key
     ([guia do Supabase](https://supabase.com/docs/guides/auth/auth-captcha)). ⚠️ confirmar o caminho do menu.
- **Como conferir:** um erro de teste aparece no Sentry **sem e-mail nem IP**; o UptimeRobot mostra "Up"; criar conta de
  teste mostra o desafio do Turnstile.
- **Destrava:** A9 (`SENTRY_DSN`), A8 (`VITE_SENTRY_DSN`, `VITE_TURNSTILE_SITE_KEY`), conferências do §10.
- Referência: [LANCAMENTO.md §7](LANCAMENTO.md).

## A7. Cloudflare R2: chaves S3, backup semanal, Environment `restauracao`

- **Objetivo:** áudio e modelos no R2, backup semanal do Postgres e o ensaio mensal de restauração funcionando.
- **Pré-requisito:** conta Cloudflare (Workers Paid, R2 e Analytics Engine já ativos). A1 para o domínio `modelos.`.
- **Passos:**
  1. Buckets (idempotente; token `CLOUDFLARE_API_TOKEN` no seu `.env` local):
     ```bash
     set -a; source .env; set +a
     node scripts/cloudflare/r2.mjs --dry-run
     node scripts/cloudflare/r2.mjs --origens https://frasy.com.br,https://www.frasy.com.br,https://frasy-staging.guigui-cruzeiro.workers.dev
     ```
     Cria `frasy-midia`, `frasy-midia-staging`, `frasy-backups` (regra `semanal`: expira em 56 dias), `frasy-modelos` e os
     `frasy-livros` e `frasy-livros-staging`, com o CORS.
  2. [Dashboard → R2 → Manage API Tokens](https://dash.cloudflare.com/?to=/:account/r2/api-tokens)
     ([docs](https://developers.cloudflare.com/r2/api/tokens/)): crie **três tokens** "Object Read & Write"/"Object Read only":
     - **escrita** em `frasy-backups` (backup semanal; e `frasy-midia` se for usar S3 em vez do binding `MIDIA`);
     - **só leitura** em `frasy-backups` (Environment `restauracao`);
     - **escrita** em `frasy-modelos` (publicar modelos).
       Anote _Access Key ID_, _Secret_ e o endpoint `https://<account-id>.r2.cloudflarestorage.com`.
  3. **Backup semanal** (`backup-pg-dump.yml`, segundas 06:00 UTC): [Settings → Secrets → Actions (repositório)](https://github.com/GuilhermeLVL/babel-play/settings/secrets/actions)
     → crie, **um por vez, sem colar valor na linha de comando** (`gh secret set NOME -R GuilhermeLVL/babel-play`, que pede o
     valor): `SUPABASE_DB_HOST`, `SUPABASE_DB_USER`, `SUPABASE_DB_PASSWORD`, `SUPABASE_DB_NAME`, `SUPABASE_CA_PEM`,
     `R2_S3_ENDPOINT`, `R2_S3_ACCESS_KEY_ID`, `R2_S3_SECRET_ACCESS_KEY`. Host = o **pooler de sessão**
     (`aws-1-sa-east-1.pooler.supabase.com`, porta 5432); o direto é só IPv6 e o runner não tem IPv6.
  4. **Environment `restauracao`** ([Settings → Environments → New environment](https://github.com/GuilhermeLVL/babel-play/settings/environments)):
     _secrets_ `R2_S3_ENDPOINT`, `R2_LEITURA_ACCESS_KEY_ID`, `R2_LEITURA_SECRET_ACCESS_KEY`; _variable_ `BACKUP_BUCKET` =
     `frasy-backups`.
  5. Domínio dos modelos: dash → R2 → bucket `frasy-modelos` → **Settings → Custom Domains** → `modelos.frasy.com.br`
     (precisa da zona Ativa, A1). Sem CORS/domínio, os modelos locais não carregam.
  6. Publicar os pesos (do computador) e o Bergamot (pelo runner do GitHub, que aguenta os ~423 MB):
     ```bash
     gh workflow run publicar-modelos.yml --field ambiente=production
     ```
     Os pesos principais: veja o passo 7 do LANCAMENTO §2 (`npx tsx scripts/modelos/publicar-no-r2.ts --bucket=frasy-modelos`,
     com `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` no ambiente).
- **Como conferir:** Actions → **Backup semanal do Postgres** → _Run workflow_ manual: verde, e
  `semanal/AAAA-MM-DD.dump` no `frasy-backups`. Depois Actions → **Exercício de restauração do Postgres** → verde com as
  contagens no resumo. `curl -sI https://modelos.frasy.com.br/...` responde com CORS.
- **Destrava:** backup antes da abertura; A8 (`VITE_SELF_HOST_MODELS`, `VITE_BERGAMOT_MODELOS_URL`).
- **Decisão sua (aberta #8):** o ensaio de restauração roda no GitHub com dados reais (inclui dados de menores). Aceite ou
  prefira o drill local (`scripts/backup/drill-restauracao.mjs`). Registre no runbook §8.
- Referência: [LANCAMENTO.md §2](LANCAMENTO.md), [deploy.md — Backup semanal](deploy.md), [deploy.md — R2](deploy.md).

## A8. GitHub Environment `production`

- **Objetivo:** o workflow `deploy-worker.yml` conseguir publicar a produção.
- **Pré-requisito:** A2 (URL/anon key/DB), A6 (DSNs, Turnstile), A7 (modelos). Token da Cloudflare com _Workers Scripts: Edit_.
- **Passos:**
  1. [Settings → Environments → New environment](https://github.com/GuilhermeLVL/babel-play/settings/environments) →
     `production`. Marque _Required reviewers_ = você e restrinja a ramos `main`/tags.
  2. **Secrets** (use `gh secret set NOME --env production -R GuilhermeLVL/babel-play`, valor no prompt):
     `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `DATABASE_URL_MIGRACAO`, `SUPABASE_CA_PEM`.
  3. **Variables** (`gh variable set NOME --env production --body <valor>`; não são segredo): `URL_DO_WORKER`
     (`https://frasy.com.br`), `VITE_PUBLIC_URL` (`https://frasy.com.br`), `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
     `VITE_SELF_HOST_MODELS` (`https://modelos.frasy.com.br`), `VITE_SENTRY_DSN`, `SITE_FLAGS_DE_VENDA` (os planos de
     `/planos` têm de bater com o checkout; ex.: `venda_planos_v4,ia_de_estudo`, confira com `flags listar` em A13).
     Opcionais: `VITE_TURNSTILE_SITE_KEY`, `VITE_BERGAMOT_MODELOS_URL` (`https://modelos.frasy.com.br`),
     `VITE_LOGIN_GOOGLE=0` (se não ligar Google), `VITE_ORT_WASM_URL`, `VITE_LIVROS_URL` (C3),
     `ADSENSE_PUB_ID` (Fase B). A lista completa está no cabeçalho do `deploy-worker.yml`.
  4. **Nunca** defina `VITE_ANUNCIOS_DEMONSTRACAO` nem `ASAAS_SANDBOX` no `production`.
- **Como conferir:** `gh api repos/GuilhermeLVL/babel-play/environments/production --jq .name` e a lista de
  secrets/variables em Settings → Environments → production.
- **Destrava:** A10.
- Referência: [LANCAMENTO.md §8, passo 3](LANCAMENTO.md), [deploy.md — Publicar o Worker (CI)](deploy.md).

## A9. `.secrets.production.json` e o envio dos secrets do Worker

- **Objetivo:** os secrets do Worker `frasy` (produção) preenchidos sem passar pelo git.
- **Pré-requisito:** A2, A3, A4, A5, A6, A7; o Worker já existe (primeiro run do A10, passo 1).
- **Passos:**
  1. `cp .secrets.example.json .secrets.production.json` (o arquivo é ignorado pelo git; **confira com `git status`**).
  2. Preencha os campos (nomes exatos do `.env.production.example`; consulte também `npx tsx scripts/cloudflare/secrets.ts --exemplo`):
     - Gere `SECRET_KEY` com `echo "hkdf:$(openssl rand -hex 32)"` e `ORIGEM_SEGREDO` com `openssl rand -hex 32`. **Guarde as
       duas no cofre**: perder a `SECRET_KEY` deixa ilegíveis as chaves de API guardadas pelos usuários e invalida a marca
       do "um teste por pessoa".
     - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (A2); `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN`, `ASAAS_BASE_URL=https://api.asaas.com/v3` (A5);
       `LLM_*`/`OPENROUTER_API_KEY`, `AI_BUDGET_USD_MONTH`, `AI_BUDGET_USD_DAY` (A4); `APP_URL`, `RESEND_API_KEY`,
       `EMAIL_REMETENTE` (A3); `SENTRY_DSN` (A6); `S3_*` do R2 (ou só o binding `MIDIA`).
     - Portas **fechadas**: `SIGNUP_ENABLED=0` e `CHECKOUT_ENABLED=0`. **Não** defina `ANUAL_ENABLED`.
  3. Confira só os nomes e depois envie:
     ```bash
     npx tsx scripts/cloudflare/secrets.ts production --dry-run
     npx tsx scripts/cloudflare/secrets.ts production
     ```
  4. Apague o arquivo local quando não precisar mais, ou deixe só no cofre.
- **Como conferir:** `npx wrangler secret list -c wrangler.jsonc` lista os nomes (sem valores); o `--dry-run` não reclama
  de nome faltando.
- **Destrava:** segundo run do deploy (A10).
- **Cuidado:** voltar uma chave exige `npx wrangler secret put NOME -c wrangler.jsonc` ou `secret delete`; tirar do JSON e
  reenviar **não apaga** o secret.
- Referência: [LANCAMENTO.md §8, passo 5](LANCAMENTO.md), [deploy.md — Secrets do Worker](deploy.md).

## A10. Deploy da produção, domínio no Worker e borda

- **Objetivo:** `https://frasy.com.br` no ar, fechado (sem cadastro e sem venda).
- **Pré-requisito:** A1 (zona Ativa), A8, A9.
- **Passos:**
  1. **Primeiro run** (cria o Worker): [Actions → deploy-worker → Run workflow](https://github.com/GuilhermeLVL/babel-play/actions/workflows/deploy-worker.yml)
     com `ambiente=production` (ou `gh workflow run deploy-worker.yml -f ambiente=production -f ref=<sha completo>`).
     Aprove como _reviewer_. O run só cria o Worker e para (sem fumaça).
  2. Envie os secrets (A9, passo 3).
  3. **Segundo run** do mesmo workflow: agora segue o fluxo por versões, com fumaça e rollback automático.
  4. `npx wrangler tail -c wrangler.jsonc` não deve mostrar `ABORTADO`; `curl -s https://<URL>/api/ready` dá 200.
  5. **Domínio no Worker**: dash → Workers & Pages → `frasy` → **Settings → Domains & Routes → Add → Custom Domain** →
     `frasy.com.br` e `www.frasy.com.br` ([docs](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)).
     A Cloudflare cria DNS e certificado sozinha (nuvem laranja).
  6. **Cabeçalho de origem**: **Rules → Transform Rules → Modify Request Header** → "Set static" `x-origem-segredo` = o
     `ORIGEM_SEGREDO` → todas as requisições do domínio. Sem ele, acesso direto à origem responde 403 (as sondas
     `/api/health` e `/api/ready` seguem passando).
  7. **Security → WAF → Managed rules**: ligue o conjunto gratuito. **Security → Bots**: deixe o _Bot Fight Mode_
     **desligado** (ele desafiaria o POST do Asaas e o Asaas pausa a fila após 15 falhas).
  8. **Security → WAF → Rate limiting rules** (1 regra no Free): caminho começa com `/api/` e mesmo IP > **300 req em
     10 s** → bloquear 10 s.
  9. **Caching → Configuration**: _Browser Cache TTL_ = **Respect Existing Headers**.
  10. Volte ao Supabase e confira os redirects (A2), ao Asaas e crie o webhook (A5, passo 3), ao Resend e confira o domínio (A3).
  11. **Flags no banco** (da sua máquina, com a `DATABASE_URL` de produção no ambiente; a CLI sai do `npm run build`):
      ```bash
      node dist-server/operacao.cjs conta papel <seu-e-mail> admin   # uma vez
      node dist-server/operacao.cjs flags ligar venda_planos_v4
      node dist-server/operacao.cjs flags listar
      ```
      `venda_familia`, `venda_pro4`, `stt_ao_vivo`, `voz_natural`, `anuncios` ficam **desligadas**. Depois de decidir (C5), ligue
      `ia_de_estudo` se for o caso. ⚠️ confirmar: o §11-bis ainda cita `venda_planos_v3`; o recorte atual (planos v4:
      Plus/Família/Pro) está no §8.8 do LANCAMENTO.md e na memória do projeto. Prevalece o que `flags listar` e
      `src/core/planos.ts` mostrarem.
- **Como conferir:** `https://frasy.com.br/api/ready` = 200; direto na origem sem o cabeçalho = 403; `crossOriginIsolated`
  = `true` no console da página (`curl -sI https://frasy.com.br/` mostra `cross-origin-embedder-policy: credentialless`).
- **Destrava:** A12, A13.
- Referência: [LANCAMENTO.md §8–§9](LANCAMENTO.md), [deploy.md](deploy.md), [flags.md](flags.md).

## A11. Jurídico e documentos: política, DPAs, contato, Termos

- **Objetivo:** textos públicos corretos e contratos com operadores em dia. Pode andar em paralelo com A2–A10, mas precisa
  estar pronto antes de A13.
- **Pré-requisito:** Fase 0 (razão social e CNPJ); A1 para o Email Routing.
- **Passos:**
  1. **`contato@frasy.com.br` via Email Routing**: dash → zona `frasy.com.br` → **Email → Email Routing**
     ([docs](https://developers.cloudflare.com/email-routing/)) → _Enable_ (aceite criar os registros MX/SPF) → _Routes_ →
     `contato@frasy.com.br` → destino = seu e-mail (confirme o e-mail de verificação).
  2. **Campos `[DONO]` da política** em `public/privacidade.html`: linhas ~44–45 (razão social, CNPJ, contato de
     privacidade), ~193–194 (cláusulas-padrão da ANPD, depois dos DPAs), ~199 (data em que os anúncios passam a aparecer),
     ~237 (produto de anúncios contratado e código da conta). Não ligue anúncios com `[DONO]` na página
     (`tests/politica-de-privacidade.test.ts` cobra a política). Faça commit e novo deploy.
  3. **DPAs**: aceite um por um e marque a linha em [`lgpd/operadores.md`](lgpd/operadores.md) (11 operadores hoje; o plano
     falava em 12, conferir): [Supabase](https://supabase.com/dashboard) (Organization → Legal Documents), Resend, Groq,
     OpenRouter, DeepInfra (só se usar voz), Asaas, Cloudflare, Sentry, UptimeRobot, Langfuse (só se ligar). Confira que cada
     DPA traz as cláusulas-padrão da ANPD (Res. CD/ANPD nº 19/2024); senão peça o aditivo. Guarde o PDF em
     `contratos/operadores/`, **fora do repositório público**. Referência: [ANPD](https://www.gov.br/anpd/pt-br).
  4. **Advogado — Termos §3–§4** (anual, 12x, teste, uso justo, cancelamento sem reembolso proporcional depois de 7 dias):
     `public/termos.html` está marcado "texto a validar". Peça a validação. Aproveite para corrigir o limite antigo do
     Premium citado no §4 (a matriz atual é 20 h/mês). **Sem isso, não abra o anual** (`ANUAL_ENABLED`).
  5. **Valores atuais do §4**: confira com o advogado também o novo recorte (Plus R$ 14,90/mês e R$ 149,00/ano; Família e Pro
     "em breve"). ⚠️ confirmar se os Termos já refletem a v4.
- **Como conferir:** a política não tem mais `[DONO` (`grep -n "DONO" public/privacidade.html` vazio); um e-mail para
  `contato@frasy.com.br` chega na sua caixa; `operadores.md` com todas as caixas marcadas.
- **Destrava:** `ANUAL_ENABLED` (Termos), abertura para menores, Fase B (ECA).

## A12. Passeio manual no staging, Safari e conferências antes de abrir

- **Objetivo:** olhos humanos em tudo que o teste automático não alcança, e fechar as caixas do
  [LANCAMENTO §10](LANCAMENTO.md#10-conferências-antes-de-abrir--30-min).
- **Pré-requisito:** staging no ar (já está); para as conferências de produção, A10.
- **Passeio no staging** (`https://frasy-staging.guigui-cruzeiro.workers.dev`):
  1. Abra o Chrome com o **Console aberto** (F12 → Console) e a aba **Rede**. Anote qualquer erro vermelho, violação de CSP/COEP
     ou recurso bloqueado.
  2. Percorra: site público (`/`, `/planos`, `/guias`), `/app`, criar conta, entrar, **2FA** em Ajustes → Conta, legendar
     uma sessão curta, jogos, Biblioteca, Livros e leitor, Planos (3–4 cartões, sem Ao Vivo nem promessa de voz neural),
     PiP/legenda flutuante e o assistente ao vivo.
  3. No console, `crossOriginIsolated` deve dar `true` (Firefox fica com você).
  4. **Safari (macOS)**: repita o passeio no Safari (você usa Safari; os diagnósticos estão em
     [`auditoria/2026-10-22-safari-diagnostico.md`](auditoria/2026-10-22-safari-diagnostico.md)). Teste especialmente o PiP
     (fallback de vídeo), o toque na janela flutuante e o Parakeet, que só foram provados em jsdom/WebKit do Playwright, não no
     Safari real. Anote a versão do Safari e o que travar.
- **Conferências do §10 que só você faz:**
  - [ ] **Cobrança real de R$ 5** no seu cartão pelo fluxo do app, conferir o plano liberado pelo webhook e **estornar** no
        painel do Asaas (precisa de A5 e `CHECKOUT_ENABLED=1` temporário só para sua conta; feche depois).
  - [ ] **Convite ao responsável**: conta de 15 anos, e-mail na caixa de entrada (não spam) com `spf/dkim/dmarc=pass`, link não
        reescrito, o responsável aceita e a conta libera a nuvem. **Sem isso, não abra para menores.**
  - [ ] **Sentry**: forçar um erro e ver o evento sem e-mail nem IP (A6).
  - [ ] Segunda-feira seguinte: `semanal/<data>.dump` no `frasy-backups` e **restaurar** o dump num banco descartável.
  - [ ] **3 cartões na produção**: conta Grátis vê os planos à venda que `GET /api/billing/status` (`planosAVenda`) devolve.
  - [ ] Alertas de fatura ligados (A14).
- **Como conferir:** todas as caixas acima marcadas, e nenhum erro vermelho novo no console.
- **Destrava:** A13.

## A13. Abrir as portas, uma de cada vez

- **Objetivo:** abrir cadastro e venda com segurança, na ordem. Fonte: [LANCAMENTO §11-bis](LANCAMENTO.md#11-bis-abrir-a-venda--passo-a-passo)
  e [runbook §0.6](runbook.md#06-abrir-e-fechar-portas).
- **Pré-requisito:** A12 inteiro, A11 (Termos para o anual; DPAs e política para tudo).
- **Passos:**
  1. **Cadastro** — `npx wrangler secret put SIGNUP_ENABLED -c wrangler.jsonc` e digite `1` (ou `secret delete`). **Em seguida**
     o Supabase: _Authentication → Providers → Email → Allow new users to sign up_ **ligado**. Crie uma conta nova: o e-mail
     chega, o login entra, o teste de 14 dias aparece em Planos.
  2. **Venda mensal** — `npx wrangler secret put CHECKOUT_ENABLED -c wrangler.jsonc` com `1`. Assine o mensal com sua conta;
     o webhook concede o plano; `GET /api/billing/status` confere.
  3. **Anual** — só com os Termos §3–§4 validados: `npx wrangler secret put ANUAL_ENABLED -c wrangler.jsonc` com `1`.
  4. **Acompanhar nas primeiras horas**: `npx wrangler tail -c wrangler.jsonc`, o Sentry e `GET /api/admin/ia` (token de admin).
  5. **Se algo estranho aparecer**, feche a porta do problema: cobrança errada → `CHECKOUT_ENABLED=0`; conta falsa em massa →
     `SIGNUP_ENABLED=0` (e desligue no Supabase); IA gastando → `AI_ENABLED=0`.
- **Como conferir:** cada passo tem o teste dele acima; `flags listar` bate com o esperado.
- **Destrava:** a produção aberta ao público.

## A14. Alertas de fatura

- **Objetivo:** não ser surpreendido por cobrança.
- **Passos:** ligue alerta de fatura/uso na [Cloudflare](https://dash.cloudflare.com/?to=/:account/billing) (Billing →
  Notifications ⚠️ confirmar o menu), no [Supabase](https://supabase.com/dashboard) (Organization → Billing, spend cap/usage
  alerts) e no [Sentry](https://sentry.io/) (Settings → Subscription → Spend notifications). Mais o teto no OpenRouter e na Groq (A4).
- **Como conferir:** os três mostram uma regra ativa com seu e-mail.

## A15. Apagar o Worker antigo `babel-play`

- **Objetivo:** tirar do ar o Worker legado (o app atual é `frasy`).
- **Pré-requisito:** nenhum; faça depois de confirmar que ele não serve nada que você usa.
- **Passos:** dash → **Workers & Pages** → `babel-play` → **Settings → Delete**. Confirme o nome antes de apagar: o
  `frasy` e o `frasy-staging` **não** podem ser apagados. Ou, pelo terminal: `npx wrangler delete --name babel-play`
  (confirme o nome do Worker antes). Esta ação é irreversível.
- **Como conferir:** o `babel-play` some da lista; `frasy` e `frasy-staging` continuam.

---

# FASE B — Anúncios (só depois da produção estável)

> Anúncios nascem **desligados** (flag `anuncios`). Menores veem anúncio comum, contextual e **sem personalização**; o
> premiado é só 18+. A página de anúncios roda num **Worker separado** (`frasy-anuncios`), nunca na origem do app.

## B1. Consulta jurídica sobre o ECA Digital

- **Objetivo:** parecer antes de mostrar anúncio a menores.
- **Passos:** leve ao advogado a [Lei 15.211/2025](https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/lei/L15211.htm)
  (ECA Digital) e o Decreto 12.880/2026 (⚠️ confirmar o link oficial do decreto), o desenho em
  [`specs/2026-10-25-site-publico-seo-e-anuncios.md`](specs/2026-10-25-site-publico-seo-e-anuncios.md) e a política de
  privacidade. Pergunte sobre: anúncio comum a menor sem perfilamento (art. 22), o parágrafo de transferência
  internacional e o texto de consentimento.
- **Como conferir:** parecer por escrito arquivado.
- **Destrava:** B4.

## B2. Rede de anúncios aprovada

- **Objetivo:** conta aprovada para o domínio próprio.
- **Pré-requisito:** site público no ar (A10) e **guias revisados** (C1): o AdSense reprova SPA sem conteúdo público.
- **Passos:**
  1. Leia a [recomendação](pesquisa/2026-10-21-rede-de-anuncios.md): Google Ad Manager por origem própria; Firefox sem
     `credentialless` fica sem anúncio (aceito).
  2. Crie a conta em [Google AdSense](https://adsense.google.com/) e/ou [Google Ad Manager](https://admanager.google.com/)
     com `frasy.com.br`; siga o fluxo de verificação do site. Defina a variable `ADSENSE_PUB_ID` no Environment `production`
     (o build gera o `ads.txt`).
  3. Configure tratamento de menores/anúncios não personalizados na conta. ⚠️ confirmar as opções exatas no painel da rede.
  4. Preencha na política o produto contratado e o código da conta (campo `[DONO]` da linha ~237, A11).
- **Como conferir:** o site fica "Pronto"/aprovado na rede; `https://frasy.com.br/ads.txt` responde.
- **Destrava:** B3.

## B3. Worker `frasy-anuncios` e variáveis

- **Pré-requisito:** B2; domínio `ads.frasy.com.br`.
- **Passos:**
  1. Publicar a página (manual; o `deploy-worker.yml` não a publica):
     ```bash
     APP_URL=https://frasy.com.br VITE_ANUNCIOS_REDE_CONTA=<código da conta> npm run anuncios:build
     npx wrangler deploy -c wrangler.anuncios.jsonc
     ```
  2. Dash → Workers & Pages → `frasy-anuncios` → **Domains & Routes → Custom Domain** → `ads.frasy.com.br`.
  3. Secret do Worker do app: `npx wrangler secret put ANUNCIOS_ORIGEM -c wrangler.jsonc` com `https://ads.frasy.com.br`
     (a CSP lê a cada 60 s). Variable do Environment `production`: `VITE_ANUNCIOS_ORIGEM` = a mesma origem; **novo deploy do
     app**.
  4. Nunca defina `VITE_ANUNCIOS_DEMONSTRACAO` no `production`.
- **Como conferir:** a página abre em `ads.frasy.com.br`; a CSP do app só ganha `frame-src` com a flag ligada.

## B4. Ligar a flag `anuncios`

- **Pré-requisito:** B1 (parecer), B2, B3 e os 4 portões de [`flags.md`](flags.md) (a caixa de bancada do §10 marcada).
- **Passos:** `node dist-server/operacao.cjs flags ligar anuncios` (ou Admin → Flags). Confira com uma conta Grátis adulta
  (aparece a folha de consentimento) e com perfil de menor (só anúncio comum). Para desfazer: `flags desligar anuncios`.
- **Como conferir:** consentimento aparece; nenhum byte de terceiro antes de consentir; sem violação no console.

---

# FASE C — O resto

## C1. Revisar os 12 guias

- **Objetivo:** publicar conteúdo para SEO e para a rede de anúncios.
- **Passos:** para cada arquivo em `content/guias/*.md` (12 guias): leia com o checklist de
  [`content/guias/LEIA-ME.md`](../content/guias/LEIA-ME.md), corrija o texto, troque `revisado: false` por `revisado: true`,
  ajuste `publicado` (AAAA-MM-DD). Commit, deploy (A10) e confira `/guias` e a página do guia. Só `revisado: true` entra no build
  e no `sitemap.xml`. Para despublicar, volte a `false`.
- **Como conferir:** `https://frasy.com.br/guias` lista os guias revisados e o `sitemap.xml` os inclui.
- **Destrava:** B2 (aprovação da rede), SEO.

## C2. Aprovar a classificação etária dos livros

- **Objetivo:** menor de idade só vê livro com faixa aprovada por você (hoje todos estão `proposta-claude` = invisíveis).
- **Passos:** leia [`livros-classificacao-sugestoes.md`](livros-classificacao-sugestoes.md) (atenção às linhas de confiança
  "baixa" e à seção "A revisar"). Teste e aprove:
  ```bash
  npx tsx scripts/livros/aprovar-classificacao.mjs --revisor=Guilherme --todos --simular
  npx tsx scripts/livros/aprovar-classificacao.mjs --revisor=Guilherme --classificacao=livre,12 --confianca=alta
  npx tsx scripts/livros/aprovar-classificacao.mjs --revisor=Guilherme --ids=pg-16,ws-pt-iracema
  npx tsx scripts/livros/montar-catalogo.mjs --verificar
  npx vitest run tests/livros-catalogo.test.ts
  ```
  Discordou de uma faixa? Edite o item em `scripts/livros/classificacao.json` (livre, 12, 14, 16, 18) e aprove com `--ids`. Depois
  faça commit do `classificacao.json` e do `public/catalogo/livros.json` e publique (deploy).
- **Como conferir:** o `--verificar` e o teste passam; um perfil de menor passa a ver os livros da sua faixa.
- Registro de decisão: _Josefine Mutzenbacher_ fica no catálogo, **só 18+**.

## C3. Enviar o Gutenberg curado ao R2 de produção

- **Objetivo:** o leitor abrir os 208 livros do Gutenberg (Standard Ebooks e Wikisource abrem direto da fonte).
- **Pré-requisito:** A7 (R2, token de escrita); C2 pode vir antes ou depois.
- **Passos:**
  1. `set -a; source .env; set +a` (com `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`), depois `node scripts/cloudflare/r2.mjs`
     (cria os buckets de livros e o CORS GET).
  2. `npx tsx scripts/livros/curar-gutenberg.mjs --conferir`, e depois `npx tsx scripts/livros/curar-gutenberg.mjs --enviar --bucket=frasy-livros`
     (o staging usou `frasy-livros-staging`).
  3. Dash → R2 → bucket de livros → **Settings → Custom Domains** → `livros.frasy.com.br` (ou ligue o acesso público `r2.dev`).
  4. Variable do Environment `production`: `VITE_LIVROS_URL=https://livros.frasy.com.br` (raiz do bucket) e novo deploy. A CSP
     abre a origem sozinha.
- **Como conferir:** abrir um livro do Gutenberg no leitor funciona; sem a variável o app avisa que a cópia não foi publicada.
- Referência: [`livros-catalogo.md`](livros-catalogo.md) §3.

## C4. Quando ligar a flag `parceiro_de_leitura`

- **Objetivo:** liberar o parceiro de leitura (explicar, analogia, pergunta com citação etc., no leitor) para planos pagos.
- **Estado:** `POST /api/ai/leitura/parceiro` existe, atrás da flag `parceiro_de_leitura` (nasce **desligada**; migração PG
  0014). A bancada está em `docs/auditoria/` (gold de 20 casos; custo medido US$ 0,0043 na cascata de produção). Quem pode
  é o plano (`parceiroDia` 40/dia e subcota `parceiroTokensMes` = 20 % da `tokensMes`).
- **Critérios sugeridos antes de ligar:** produção estável (A13) há alguns dias; `AI_BUDGET_USD_*` coerentes; C2 feita
  (menor só vê livro aprovado; o servidor já dá 403 para livro que a vitrine não mostra); fichas dos livros revisadas por
  você. ⚠️ confirmar: não achei um doc de "portões" do parceiro como o de anúncios; a decisão é sua.
- **Passos:** `node dist-server/operacao.cjs flags ligar parceiro_de_leitura` (ou Admin → Flags). Desfazer: `flags desligar`.
- **Como conferir:** com conta paga, o parceiro responde; sem conta paga, 404/negado; acompanhar `GET /api/admin/ia`.

## C5. Decisões de produto que dependem de você

Cada uma é uma decisão, não uma tarefa de painel. Registre a escolha onde indicado.

| decisão                                     | o que decidir                                                                                                                                                        | onde registrar / fonte                                                               |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **Parakeet também em inglês**               | Parakeet foi medido melhor que o Moonshine no inglês (7,1 % contra 13,6 %); hoje é padrão só em pt/es (≥ 8 GB ou Mac Apple). Estender ao inglês?                     | [`specs/2026-10-23-modelos-no-aparelho.md`](specs/2026-10-23-modelos-no-aparelho.md) |
| **Reconhecimento local do Chrome**          | A camada não funcionou no Chrome 155 + macOS 27 beta. Testar de novo no Chrome estável ou desistir                                                                   | idem                                                                                 |
| **Limite/alerta do pool da amostra grátis** | Número do pool global (hoje 120 chamadas/dia) e alerta contra esgotar; o Grátis tem 5 explicações/dia e 1 resumo/semana (`AMOSTRA_DE_IA`)                            | [`flags.md`](flags.md) (`ia_de_estudo`); `npm run ia:custo`                          |
| **Alerta `billing_parcela_ambigua`**        | A parcela 12,49 colide entre Plus e Premium; o desempate usa `subscriptions.plano_da_cobranca`. Crie o alerta no Sentry (A6) para o evento `billing_parcela_ambigua` | `server/lib/billingEventos.ts`                                                       |
| **`voz_natural` (retenção LGPD)**           | Só ligar depois de registrar a retenção do provedor de voz na LGPD (DeepInfra/Azure) e assinar o DPA; até lá o Plus mostra "em breve"                                | [pesquisa de vozes](pesquisa/2026-10-21-vozes-por-nivel.md); `lgpd/operadores.md`    |
| **Serviço do Ao Vivo** (`stt_ao_vivo`)      | Fora do lançamento; escolher o serviço por medição depois                                                                                                            | [`flags.md`](flags.md); `ESTADO-DO-LANCAMENTO.md` §4                                 |
| **E-mails de cobrança do Asaas**            | Ligar ou deixar desligados (docs se contradizem)                                                                                                                     | A5, passo 6                                                                          |
| **Compute do Supabase/Hyperdrive**          | Subir antes de ~100 simultâneos?                                                                                                                                     | [`escala.md`](escala.md)                                                             |
| **Langfuse**                                | Ligar e com que amostragem (fora do custo fixo de ~R$ 165/mês)                                                                                                       | `LANCAMENTO.md` — Custo mensal                                                       |

---

## Rotina depois do lançamento (resumo)

| quando           | o quê                                                                            |
| ---------------- | -------------------------------------------------------------------------------- |
| todo dia útil    | Sentry (issues novas) e gasto de IA (`GET /api/admin/ia`)                        |
| toda semana      | PRs do Dependabot (CI verde → deploy staging → production)                       |
| todo mês         | restaurar o dump semanal à mão (runbook §0.2 e §8) e anotar; conferir as faturas |
| a cada trimestre | `node scripts/modelos/revisoes.mjs`; revisar a RoPA (`docs/lgpd/ropa.csv`)       |

**Chaves de emergência** (todas por `npx wrangler secret put NOME -c wrangler.jsonc`; vale na próxima requisição): `AI_ENABLED=0`
(sem IA de nuvem), `CHECKOUT_ENABLED=0` (fecha assinar), `SIGNUP_ENABLED=0` (e desligar no Supabase), `AI_BUDGET_USD_MONTH=<US$>`.

## Itens marcados "confirmar" neste guia

1. Nomes de menus exatos nos painéis (Registro.br, Supabase PITR/SSL/CAPTCHA, Cloudflare Billing, Asaas assinaturas).
2. Projeto Supabase separado do staging: só Auth ou também o Postgres (R11).
3. Flag de venda atual: `venda_planos_v4` (planos v4) contra o §11-bis que ainda cita `venda_planos_v3`.
4. Se os Termos já refletem os planos v4 (Plus/Família/Pro) e o limite do §4.
5. Link oficial do Decreto 12.880/2026 e opções de menores no painel da rede de anúncios.
6. Critérios para ligar `parceiro_de_leitura` (sem doc de portões).
