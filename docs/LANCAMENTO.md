# Lançamento — o passo a passo do dono

Este é o roteiro para colocar o Frasy no ar pela primeira vez, na arquitetura do
[ADR 0015](adr/0015-cloudflare-workers-no-lugar-do-fly.md): **Cloudflare Workers** (o app inteiro, com
**Hyperdrive** até o Postgres), **Supabase Pro** (login e banco, em São Paulo), **Cloudflare R2** (áudio, modelos
e backup semanal), **Resend**, **Sentry** e **UptimeRobot**; IA com **Groq** e **OpenRouter** de reserva; cobrança
pelo **Asaas**.

Tudo o que é código já está pronto e testado; o que falta são as **contas**, os **painéis** e as
**chaves**. Siga a ordem — cada passo usa o que o anterior criou. Nenhuma chave vai para o
repositório: segredo entra por `scripts/cloudflare/secrets.ts` (secrets do Worker) ou pelos _secrets_ do GitHub.

> Onde cada variável vai e o que ela faz: [`.env.production.example`](../.env.production.example).
> O que fazer quando algo quebrar: [`docs/runbook.md`](runbook.md), seção 0.

Guarde, durante o caminho, um cofre de senhas (Bitwarden/1Password) com uma entrada por serviço:
login, 2FA, e as chaves geradas. **Ligue 2FA em todas as contas** — a conta da Cloudflare
comprometida é o app inteiro comprometido.

---

## Custo mensal

| peça                                                                   | plano                                    | custo estimado                                     |
| ---------------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------- |
| Cloudflare Workers Paid — o app, os crons e o Hyperdrive               | Workers Paid                             | US$ 5 ²                                            |
| Supabase Pro (projeto em sa-east-1, sem pausa, backup do Auth)         | Pro                                      | US$ 25                                             |
| Cloudflare — DNS, WAF gerenciado básico, 1 regra de rate limit, HTTPS  | Free                                     | US$ 0                                              |
| Cloudflare R2 — áudios, pesos dos modelos e backup semanal (≈ 5–15 GB) | pago por uso (10 GB grátis, egress zero) | ~US$ 0–0,30                                        |
| Resend — e-mails de login (3.000/mês grátis)                           | Free                                     | US$ 0                                              |
| Sentry — erros (5 mil eventos/mês)                                     | Developer                                | US$ 0                                              |
| UptimeRobot — monitor HTTP + página de status                          | Free                                     | US$ 0                                              |
| Domínio `.com.br` (Registro.br, R$ 40/ano)                             | —                                        | ~R$ 3,33                                           |
| Groq + OpenRouter                                                      | pré-pago / teto no painel                | **variável, com teto** (ver `AI_BUDGET_USD_MONTH`) |
| **Fixo**                                                               |                                          | **≈ US$ 30 + R$ 3,33 ≈ R$ 165/mês** ²              |

² **Esta tabela é a fonte do custo fixo nos docs.** O Workers Paid (US$ 5/mês ≈ R$ 27 a R$ 5,20 + IOF de 3,5 %) substitui a máquina do Fly, e é
ele que liga os crons (7 expressões no `wrangler.jsonc`); requisições e CPU além da franquia incluída são cobradas
por uso, a conferir na primeira fatura. Fixo = US$ 5 + US$ 25 (Supabase Pro) = US$ 30, a R$ 5,20 + IOF de 3,5 %
(câmbio PTAX de 25/09/2026) ≈ R$ 161, mais ~R$ 3,33 do domínio. O modelo `node scripts/custo/modelo.mjs` ainda
traz as premissas do Fly e não foi recalculado. O total **não inclui o Langfuse**: ligado sem amostragem, o modelo
soma ~US$ 29/mês já com 10 cadastrados
([tabelas da matriz v2](../openspec/changes/planos-v2/custo/custo-v2-tabelas.md), T3). `docs/escala.md` aponta
para cá.

O Asaas não tem mensalidade: cobra por transação (cartão ~R$ 0,49 + 1,99 % a 2,99 %; Pix ~R$ 0,99).

**O que se vende (planos v2, ADR 0011):** Grátis + **Premium** — R$ 19,90/mês, **R$ 179/ano** à vista (Pix,
boleto ou cartão; renova em um ano) ou em **12x no cartão** (11 × R$ 14,91 + R$ 14,99; não renova), e o
**teste de 14 dias sem cartão** (um toque, um por pessoa, nunca cobra). "Sem limite no dia a dia" com **uso
justo** de 2 h/dia e 40 h/mês de nuvem (o empate de custo na pilha de hoje; 60 h só depois do B7). A conta
de custo por assinante está em `scripts/custo/modelo.mjs` (`node scripts/custo/modelo.mjs`).

---

## 1. Domínio (Registro.br) — 10 min

1. registro.br → registrar `frasy.com.br` (ou o nome escolhido) com o **CNPJ** da empresa (o
   contador abre a ME no Simples; MEI não pode ter SaaS).
2. Ainda **não** mude os servidores DNS — isso é no passo 2.

## 2. Cloudflare (DNS, HTTPS, WAF, R2) — 40 min

1. Criar conta em cloudflare.com, **ligar 2FA**, "Add a site" → o domínio → plano **Free**.
2. No Registro.br, trocar os servidores DNS para os dois que o Cloudflare mostrar. Esperar o
   "Active" (minutos a algumas horas).
3. **SSL/TLS** → modo **Full (strict)**; **Edge Certificates** → _Always Use HTTPS_ e _HSTS_
   (max-age 6 meses, sem _preload_ no começo); _Minimum TLS_ 1.2.
4. **R2** → ativar (pede cartão; os primeiros 10 GB são grátis). Os buckets, a retenção e o CORS saem de um script
   idempotente (o token `CLOUDFLARE_API_TOKEN` do `.env`; detalhes em `docs/deploy.md`, "R2: criar/conferir buckets"):
   ```bash
   set -a; source .env; set +a
   node scripts/cloudflare/r2.mjs --dry-run   # o plano
   node scripts/cloudflare/r2.mjs --origens https://<domínio>,https://www.<domínio>,https://frasy-staging.guigui-cruzeiro.workers.dev
   ```
   Cria `frasy-midia`, `frasy-midia-staging`, `frasy-backups` (regra `semanal`: `semanal/` expira em 56 dias) e
   `frasy-modelos` (CORS GET/HEAD para as `--origens`, max-age 86400). Não há _location hint_ de América do Sul no
   wrangler: os buckets ficam onde a Cloudflare escolher (ENAM).
5. No bucket `frasy-modelos` → _Settings → Custom Domains_ → `modelos.<domínio>` (**público**). O app sai com
   isolamento de origem ligado — COEP `credentialless` + Document-Isolation-Policy — para o WASM ter threads. Os pesos
   são baixados por `fetch` com CORS, então o CORS do passo 4 é tudo o que o bucket precisa:
   `Cross-Origin-Resource-Policy` não é exigido. Sem o CORS, os modelos locais não carregam.
6. **R2 → Manage API tokens** → criar **dois tokens** "Object Read & Write", cada um restrito a UM
   bucket: `midia` (+ `backups`) e `modelos`. Anotar _Access Key ID_, _Secret_ e o
   endpoint `https://<conta>.r2.cloudflarestorage.com`.
7. Publicar os pesos dos modelos, do seu computador (baixa do Hugging Face na revisão fixada,
   confere o sha256 de cada peso e sobe):
   ```bash
   S3_ENDPOINT=https://<conta>.r2.cloudflarestorage.com S3_ACCESS_KEY_ID=<token modelos> \
   S3_SECRET_ACCESS_KEY=<segredo> npx tsx scripts/modelos/publicar-no-r2.ts --bucket=frasy-modelos
   ```
8. Publicar os modelos do **Bergamot** (tradução X→inglês no aparelho: 15 idiomas, ~423 MB no bucket, ~30–45 MB
   por idioma para quem usa — contra ~113 MB do opus-mt). Suba **pelo runner do GitHub** (a rede doméstica não
   aguenta 423 MB): Actions → **publicar-modelos** → `ambiente` (staging|production) e `pares` (`all` ou `ja-en,zh-en`),
   ou `gh workflow run publicar-modelos.yml --field ambiente=production`. Usa só o `CLOUDFLARE_API_TOKEN` e o
   `CLOUDFLARE_ACCOUNT_ID` do Environment (sem chaves S3): baixa do bucket da Mozilla, confere o sha256 contra
   `src/gateway/adapters/modelosDoBergamot.json` e sobe em `bergamot/<par>/<execução>/<arquivo>` no `frasy-modelos`.
   Em produção, o bucket precisa do **domínio próprio** `modelos.<domínio>` (r2.dev tem limite de taxa; ver
   `docs/deploy.md`, "Modelos no R2"). Alternativa com chaves S3, de uma máquina com banda:
   ```bash
   S3_ENDPOINT=https://<conta>.r2.cloudflarestorage.com S3_ACCESS_KEY_ID=<token modelos> \
   S3_SECRET_ACCESS_KEY=<segredo> npx tsx scripts/modelos/publicar-bergamot-no-r2.ts --bucket=frasy-modelos
   ```
   Depois, no build (variável do environment no GitHub, passo 3 da §8): `VITE_BERGAMOT_MODELOS_URL=https://modelos.<domínio>`
   (a raiz do bucket, **sem** sufixo). Sem a variável o app segue como antes: só pt→en, embutido no `dist`; com ela,
   ja/ko/zh/es/fr/de/it/ru/ar/cs/fi/hu/nl/pl/th→inglês (e `X→pt` pelo inglês, nos que o opus-mt já cobria) passam a
   usar o Bergamot, com o opus-mt de reserva. Rode `--seco` antes para ver a lista sem enviar nada.
   (Opcional) O runtime do ONNX no mesmo bucket: `npx tsx scripts/modelos/publicar-no-r2.ts --prefixo=ort/1.26.0`
   (mesmas credenciais) e, no build, `VITE_ORT_WASM_URL=https://modelos.<domínio>/ort/1.26.0/`. Sem ela, sai de `/`.
9. A WAF, a regra de rate limit e o cabeçalho de origem ficam para o passo 9 (precisam do app no ar).

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
   **service_role/secret key** (secreta — só vai para os secrets do Worker). Confirmar em _JWT Keys_ que o projeto
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
   vai para o Supabase (passo 4) e para os secrets do Worker (`RESEND_API_KEY`, passo 8).
4. No Supabase → **Authentication → SMTP Settings** → _Enable custom SMTP_: host `smtp.resend.com`,
   porta 465, usuário `resend`, senha = a chave, remetente `nao-responda@<domínio>`, nome "Frasy".
5. **O convite ao responsável** (Fase 4: conta de menor de 16 anos fica sem nuvem até o responsável
   aceitar) sai pela **API HTTP** do Resend — `POST https://api.resend.com/emails`, em
   `server/lib/conviteDoResponsavel.ts` —, não pelo SMTP do Supabase, que só manda os modelos de login.
   Precisa de duas variáveis nos secrets do Worker: `RESEND_API_KEY` (a chave do passo 3) e
   `EMAIL_REMETENTE="Frasy <nao-responda@<domínio>>"`, mais `APP_URL=https://<domínio>`, que
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

**Sem reserva não lança tranquilo.** Em produção, se a IA de nuvem subir sem reserva (chave da
OpenRouter ausente ou expirada, ou meia `LLM_RESERVA_*`), o boot registra o aviso `ia_sem_reserva`,
que chega ao Sentry (ADR 0008): a próxima queda da Groq chegaria a todo assinante ao mesmo tempo.

**STT:** não precisa de chave própria — com só `LLM_API_KEY` da Groq, a transcrição usa a mesma chave
(a disponibilidade e a transcrição leem a mesma regra desde o B0 da Fase B).

**Opcional — o registro declarativo (`IA_PROVEDORES`).** Sem ele, nada muda: vale o que está acima.
Com ele, a lista de provedores, a ordem da cascata, a retenção, os limites e o **preço por
provedor:modelo** (inclusive a entrada em cache e o mínimo faturado do STT) ficam num JSON sem
segredo; as chaves continuam nos secrets do Worker com os nomes que o JSON cita (`DEEPINFRA_API_KEY`,
`CLOUDFLARE_ACCOUNT_ID`/`CLOUDFLARE_API_TOKEN`, `CEREBRAS_API_KEY`…). O formato e um exemplo estão no
`.env.production.example`. Em produção o boot **aborta** se o registro citar o Gemini, um OpenRouter
sem o roteamento de retenção zero que ignora o Google, ou qualquer provedor sem `"retencao": "zdr"`
— confira a retenção zero no painel de cada provedor ANTES de declarar. Trocar o provedor ou o
modelo padrão só com o resultado da bancada (Fase B, B5/B7).

**Os níveis (B3).** Com o registro, cada modelo de tradução/tutor pode dizer a quem serve:
`"niveis": ["rapida"]` (o padrão — Grátis, convidado e a nuvem de alívio) ou `["nuance"]` (quem paga:
o entitlement `traducaoNuance`). Quem paga começa pelo modelo da nuance e cai no da rápida se ele
falhar; quem não paga nunca chega ao da nuance. Sem o registro, vale o `LLM_MODEL_GRANDE` de sempre,
para o plano com `largerModels`.

**A cascata do STT (B6).** Com mais de um provedor de STT no registro, cada áudio vai primeiro para
quem cobra MENOS por ele — com o mínimo faturado de cada um: a Groq cobra 10 s por pedido, então a
fala curta vai para quem cobra por segundo (declare `"minimoFaturadoS": 0` nele; ausente, o servidor
supõe 10 s). 429, 5xx e timeout passam para o próximo, e o disjuntor é por provedor. A Cloudflare
(Workers AI) entra com `"formato": "cloudflare"` e o modelo `@cf/openai/whisper-large-v3-turbo` — o
áudio vai em base64 pela rota nativa; confira no painel dela que a conta não guarda o conteúdo
(Workers AI → Privacy) antes de declarar `"retencao": "zdr"`.

Decida o **orçamento global** `AI_BUDGET_USD_MONTH` (soma do que aceita gastar nos dois; sem ela o
app usa US$ 20). São três números diferentes de propósito: **US$ 20** é o padrão do código quando a
variável não existe (`ORCAMENTO_PADRAO_USD`, `server/lib/config.ts`); **US$ 30** e **US$ 10** são os
limites sugeridos no painel de cada provedor (Groq e OpenRouter, acima); e **US$ 40** — a soma dos dois —
é o valor sugerido para a variável no passo 8 e no `.env.production.example`. O servidor estima o gasto de cada chamada (`server/lib/orcamentoDeIa.ts`) pelo
preço do **provedor que de fato respondeu** — com o primário em 429, o da reserva —, com os tokens do
cache de prompt mais baratos e o mínimo faturado do STT de cada provedor; o `/metrics` mostra o custo
e a latência por `fornecedor` e `modelo` (`ia_provedor_custo_usd_total`, `ia_provedor_latencia_ms`). A 80 %
sai o evento `ia_orcamento_alerta_80` e a 100 % o `ia_orcamento_esgotado` — a IA de nuvem fecha
sozinha até o mês virar e o app volta para os modelos locais. Os dois chegam ao Sentry; a regra de
alerta está no passo 7.

**Antes do corte, a degradação suave (B4).** Com o orçamento (do mês ou do dia, o que estiver mais
perto do fim) a **70 %**, quem paga começa no modelo mais barato da cascata quando o balde do primeiro
provedor está abaixo de 20 %; a **90 %**, todo mundo começa no mais barato, e a saída dos modelos sem
raciocínio cai para 75 %. Não há variável: é a regra do plano. O `/metrics` conta cada chamada
degradada em `ia_degradacao_de_custo_total{motivo,nivel}` — subindo antes do fim do mês, o orçamento
está curto para o tráfego. Com o `IA_PROVEDORES`, os `limites` declarados (rpm, tpm, rpd, tpd) são
os baldes da admissão de cada provedor; sem eles, valem as `IA_ADMISSAO_*`.

**A nuvem de alívio do Grátis (A10)** nasce desligada (flag `nuvem_gratuita_alivio`). Ligada, ela sai
do mesmo orçamento, com dois tetos opcionais: `ALIVIO_TETO_USD_MES` (por conta, no mês; padrão
US$ 0,13, que cobre as 3 h; `0` fecha o alívio) e `ALIVIO_POOL_USD_DIA` (todas as contas, no dia;
ausente, 20 % do orçamento diário — o valor só baixa esse pool, os 80 % restantes são de quem paga).

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
5. **As três formas de assinar** (C5) não pedem configuração a mais no painel: o servidor cria a assinatura
   mensal (`MONTHLY`), a anual (`YEARLY`, R$ 179) ou o **parcelamento** do 12x (`installmentCount: 12`, só
   `CREDIT_CARD` — um carnê de Pix/boleto daria o ano pela 1ª parcela). As parcelas chegam pelos mesmos
   eventos de **cobrança** do webhook (o ramo do parcelamento confere `installment` na API). Confira no painel
   que **juros e multa** da conta estão zerados, como na sondagem: o valor pago é o que decide plano e ciclo.
6. **Pix Automático** fica DESLIGADO (o `/assinar` responde 501 `pix_automatico_indisponivel`): em produção o
   Asaas exige conta **PJ com CNPJ ativo há 6 meses ou mais** e sem restrição de Pix. Quando a conta for
   elegível, a integração entra atrás de flag (change `planos-v2`, C5).
7. **Teste de 14 dias:** nada a configurar no Asaas (o teste não cria cobrança). A marca "um por pessoa" é
   o HMAC do e-mail com a chave derivada da `SECRET_KEY`: **trocar a `SECRET_KEY` invalida as marcas** — quem
   já testou poderia testar de novo. Mais um motivo para guardá-la no cofre (passo 8).

## 7. Sentry e UptimeRobot — 20 min

**Sentry:** sentry.io → organização (região **EU** ou US) → plano Developer → **2 projetos**:
`babel-play-servidor` (plataforma Node) e `babel-play-navegador` (Browser JavaScript). Em cada um,
**Settings → Security & Privacy**: _Prevent Storing of IP Addresses_ **ligado**, _Data Scrubber_
**ligado**, _Use Default Scrubbers_ **ligado**. Anotar os dois **DSN**. Em **Alerts**: e-mail em
issue nova, e uma regra no projeto do servidor para `tags.event` igual a `ia_orcamento_alerta_80`
ou `ia_orcamento_esgotado` → e-mail imediato. Aceitar o DPA.

**UptimeRobot:** uptimerobot.com → conta → dois itens (o backup semanal avisa pelo próprio GitHub Actions, `backup-pg-dump.yml`):

1. _Monitor HTTP(s)_ em `https://<domínio>/api/ready`, a cada 5 min, alerta por e-mail (e app);
2. _Status page_ pública com o monitor HTTP (link no rodapé do app/Termos).

No GitHub → _Settings → Secrets and variables → Actions → Variables_ → `HEALTH_URL =
https://<domínio>/api/health` (liga o `uptime.yml`, o segundo par de olhos, que abre issue quando cai).

## 8. Cloudflare Workers — o app no ar — 40 min

O app é o Worker `frasy` (`wrangler.jsonc`), publicado pelo workflow `deploy-worker.yml` por **versões**, com
fumaça e rollback (detalhes em [`deploy.md`](deploy.md), "Publicar o Worker (CI)"). O staging já faz o mesmo
caminho: [`STAGING.md`](STAGING.md).

1. cloudflare.com → conta com **2FA** → plano **Workers Paid** (US$ 5/mês). Ele é pré-requisito por dois motivos: sem ele os crons não existem, **e** o plano Free corta a requisição em 10 ms de CPU. A carga do staging (Task 8) devolveu 16 % de `503` com corpo vazio, que é o `exceededResources` desse teto; no Paid o limite de CPU por requisição é bem maior. Ative o
   **Analytics Engine** no painel da conta (o `wrangler deploy` reprova sem ele, código 10089). O domínio
   (`frasy.com.br`) precisa estar como zona na mesma conta (passo 2).
2. **Token de API** (Workers Scripts: Edit, mais o que o `scripts/cloudflare/` usar) e o **Account ID** da conta.
   O Hyperdrive de produção (`babel-sp`, apontando o Postgres do Supabase) já está no `wrangler.jsonc`; os buckets
   saíram do passo 2.
3. **GitHub Environment `production`** (Settings → Environments, com _Required reviewers_ = você e política de
   ramos de deploy só `main`/tags): _secrets_ `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`,
   `DATABASE_URL_MIGRACAO` (pooler de **sessão** do Supabase, `?sslmode=verify-full`) e `SUPABASE_CA_PEM`;
   _variables_ `URL_DO_WORKER`, `VITE_PUBLIC_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
   `VITE_SELF_HOST_MODELS=https://modelos.<domínio>`, `VITE_SENTRY_DSN` (o do projeto do navegador). Opcionais,
   também como _variables_: `VITE_LOGIN_GOOGLE=0` (esconde "Continuar com Google" enquanto o provedor não estiver
   ligado no Supabase; sem a variável o botão aparece), `VITE_TURNSTILE_SITE_KEY`, `VITE_ORT_WASM_URL`,
   `VITE_DESENHO_NOVO_PADRAO=1` e `VITE_BERGAMOT_MODELOS_URL`. A lista completa está no cabeçalho do workflow.
4. **Primeiro run** (Actions → **deploy-worker** → Run workflow → `ambiente=production`): como o Worker ainda
   não existe, o run apenas o cria (`wrangler deploy`, sem fumaça) e para.
5. **Secrets do Worker**, da sua máquina (os valores vêm dos passos anteriores; a lista comentada está no
   `.env.production.example`): copie `.secrets.example.json` para `.secrets.production.json` (ignorado pelo git),
   preencha (`SECRET_KEY` no formato `hkdf:<64 hex>`, ver `deploy.md`, "Gerar a `SECRET_KEY`"; `ORIGEM_SEGREDO`;
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`; as `ASAAS_*`; as `S3_*` do R2 (ou só o binding `MIDIA`); as `LLM_*`;
   `AI_BUDGET_USD_MONTH`; `APP_URL`; `SENTRY_DSN`; `RESEND_API_KEY`; `EMAIL_REMETENTE`) e rode:
   ```bash
   npx tsx scripts/cloudflare/secrets.ts production --dry-run   # confere só os nomes
   npx tsx scripts/cloudflare/secrets.ts production
   ```
   Gere a chave com `echo "hkdf:$(openssl rand -hex 32)"` e `ORIGEM_SEGREDO` com `openssl rand -hex 32`; guarde
   **as duas no cofre**: perder a `SECRET_KEY` torna ilegíveis as chaves de API que os usuários guardaram.
6. **Segundo run** do `deploy-worker` (`production`): daí em diante é o fluxo por versões, com fumaça e rollback
   automático. Cadastro e venda sobem **fechados** (`SIGNUP_ENABLED=0`, `CHECKOUT_ENABLED=0`).
7. `wrangler tail` (`npx wrangler tail -c wrangler.jsonc`) não deve mostrar `ABORTADO`; o `/api/ready` deve dar 200.
8. **Flags do lançamento** (banco, sem deploy; valem em até 30 s). O recorte é: `venda_planos_v3` **ligada** (Grátis, Essencial
   e Premium à venda), `stt_ao_vivo` **desligada** (o Ao Vivo não é vendido), `voz_natural` **desligada**, `anuncios`
   **desligada**. Os padrões de fábrica já são "desligada" (migrações `0046` (`voz_natural`), `0048` e `0051`); só `venda_planos_v3` pede ação.
   Duas portas, as mesmas de [`flags.md`](flags.md): no app, logado como admin com o 2FA confirmado, **Admin → Flags**
   (liga e desliga o interruptor `habilitada`), ou pela CLI, da sua máquina com a `DATABASE_URL` de produção no
   ambiente (a CLI sai de `npm run build`):
   ```bash
   node dist-server/operacao.cjs conta papel <seu-e-mail> admin   # uma vez: o papel mora no banco
   node dist-server/operacao.cjs flags ligar venda_planos_v3
   node dist-server/operacao.cjs flags listar                      # confere: venda_planos_v3 LIGADA, as outras desligada
   ```
   Ligar a flag **não abre a venda**: o checkout continua fechado por `CHECKOUT_ENABLED=0` até o §11-bis.
9. **Página de anúncios** (só se for usar anúncios; pode ficar para depois do jurídico e da rede): o Worker próprio
   `frasy-anuncios` é publicado à mão, `npm run anuncios:build` e `npx wrangler deploy -c wrangler.anuncios.jsonc`,
   com o domínio `ads.<domínio>`. Passo a passo e variáveis em [`deploy.md`](deploy.md), "Anúncios". Publicá-lo não
   liga nada: a flag `anuncios` segue desligada.

## 9. Domínio no Worker e a borda fechada — 20 min

1. **Custom Domain no Worker**: Cloudflare → Workers & Pages → `frasy` → _Settings → Domains & Routes → Add →
   Custom Domain_ → `<domínio>` (e `www.<domínio>`). A Cloudflare cria o DNS e o certificado sozinha, com a **nuvem
   laranja (proxied)**; não há `CNAME` nem validação à mão.
2. **Supabase**: _Authentication → URL Configuration_ com `https://<domínio>/auth/callback` (passo 3.5).
   **Asaas**: o webhook em `https://<domínio>/api/billing/webhook/asaas` (passo 6). **Resend**: o domínio verificado
   (passo 4).
3. **Rules → Transform Rules → Modify Request Header** → "Set static" `x-origem-segredo` =
   o `ORIGEM_SEGREDO` → aplicar a todas as requisições do domínio. Quem chega direto na origem sem esse cabeçalho
   recebe 403 (as sondas `/api/health` e `/api/ready` continuam passando).
4. **Security → WAF → Managed rules**: ligar o conjunto gratuito. **Security → Bots**: deixar o
   _Bot Fight Mode_ **desligado** no MVP. No plano Free ele não pode ser pulado por regra de WAF para um
   caminho, e o POST do Asaas em `/api/billing/webhook/asaas` receberia um desafio: com 15 falhas
   seguidas o Asaas pausa a fila e nenhum pagamento concede plano. Os limites do servidor e a regra de
   rate limit do passo seguinte já cobrem o abuso. Se um dia ligar, conferir no painel do Asaas (Webhooks →
   histórico) que a entrega segue com 200 logo depois.
5. **Security → WAF → Rate limiting rules** (1 regra no Free): "se o caminho começa com `/api/` e
   o mesmo IP passa de **300 requisições em 10 s** → bloquear por 10 s". É a rede de fora; os limites
   finos por usuário estão no servidor.
6. **Caching → Configuration**: _Browser Cache TTL_ = **Respect Existing Headers** (o servidor já
   manda `immutable` nos assets e `no-cache` no `index.html`).

## 10. Conferências antes de abrir — 30 min

- [ ] `https://<domínio>/api/ready` responde 200; o acesso direto à origem, sem o cabeçalho de origem, responde 403.
- [ ] Criar uma conta de teste, confirmar o e-mail (chega pelo Resend), entrar, **ativar o 2FA** em
      Ajustes → Conta, sair e entrar de novo (o app pede o código).
- [ ] Gravar uma sessão curta: o áudio aparece no bucket `frasy-midia`.
- [x] **Threads do WASM**: no Chrome ou no Firefox, console da página → `crossOriginIsolated` dá
      `true` (staging, 21/10/2026: Chromium 156 → `true`; Firefox fica com o dono) (`curl -sI https://<domínio>/` mostra `cross-origin-embedder-policy: credentialless` e
      `document-isolation-policy`). Se algum recurso de terceiro parar de carregar por causa do COEP,
      `CROSS_ORIGIN_ISOLATION=dip` (secret do Worker, `npx wrangler secret put CROSS_ORIGIN_ISOLATION
-c wrangler.jsonc`, vale sem novo deploy) mantém as threads no Chrome/Edge; `0` desliga.
- [ ] Na segunda seguinte: `semanal/<data>.dump` no `frasy-backups` (workflow `backup-pg-dump.yml` verde).
- [ ] **Restaurar o dump** num banco descartável (`pg_restore`, runbook §0.2 e §8) e anotar a data no runbook.
- [x] Rodar o **ZAP Baseline** (Actions → _ZAP Baseline (staging)_ com a URL do staging) e triar. (21/10/2026, run
      39640692221: 0 FAIL, 7 WARN conhecidos e aceitos, triagem no inventário de 21/10)
- [ ] **Cobrança real de R$ 5** no seu cartão pelo fluxo do app, conferir o plano liberado pelo
      webhook, e **estornar** no painel do Asaas.
- [x] **Os três ciclos no sandbox** (C5): mensal, anual em uma vez e anual em 12x com o cartão de teste do
      Asaas — conferir na tela "Premium · mensal / anual / anual em 12x", o fim do período (35 d ou 370 d) e o
      arrependimento de 7 dias devolvendo o ano inteiro (o parcelamento inteiro no 12x). (staging `0b82814`,
      21/10/2026, pelo app e pagando com o cartão de teste via API, com `ANUAL_ENABLED=1` só durante a prova:
      mensal → `valeAte` vencimento + 35 d; anual à vista → + 370 d e `/cancelar` estornou R$ 149,90; 12x → 11 ×
      R$ 12,49 + R$ 12,51, pagar a 1ª confirma as 12 e manda **12 `PAYMENT_CONFIRMED`** (todas no mesmo fim) e
      `/cancelar` estornou o parcelamento inteiro. A tela não foi aberta: conferido por `GET /api/billing/status`.
      Antes, no Worker, toda chamada ao Asaas caía em 400 `user_agent_not_informed`, corrigido em `f1d347af`.
      Inventário de 21/10, §9.)
- [x] **O teste de 14 dias** numa conta nova: um toque em Planos, a faixa "Premium · teste" com a data, nada
      no Asaas; apagar a conta e recriar com o mesmo e-mail **não** renova o teste. (staging, 21/10/2026: "Premium ·
      em teste", 14 dias, nenhuma chamada ao Asaas; recriada → `marca_usada` e 409 `teste_ja_usado`)
- [ ] **Termos §3–§4 validados pelo jurídico** (anual, 12x, teste, uso justo, cancelamento sem reembolso
      proporcional depois dos 7 dias — marcado "texto a validar" no HTML). **Sem isso, não abra a venda do
      anual.**
- [ ] Forçar um erro de teste e ver o evento no Sentry **sem** e-mail nem IP. (21/10/2026: o staging não tem
      `SENTRY_DSN` nem `VITE_SENTRY_DSN`; fica para quando o dono criar o projeto no Sentry)
- [ ] Aceitar os DPAs e marcar `docs/lgpd/operadores.md`; atualizar a política de privacidade com os
      operadores novos (a lista está lá).
- [ ] Ligar alerta de fatura na Cloudflare, no Supabase e no Sentry.
- [ ] **Convite ao responsável por e-mail** (passo 4.5): `wrangler tail` **sem** `[convite] AVISO`; testar
      com uma conta de 15 anos — o e-mail chega (caixa de entrada, não spam; nos cabeçalhos,
      `spf=pass`, `dkim=pass` e `dmarc=pass`), o link não foi reescrito pelo Resend, o responsável
      aceita e a conta libera a nuvem. **Sem isso, não abra para menores.**
- [ ] **3 cartões na produção** (provado no staging em 21/10/2026: 3 cartões, sem Ao Vivo nem neural, `planosAVenda`
      `essencial`+`premium`; falta repetir na produção): logado numa conta Grátis, Planos mostra Grátis, Essencial e Premium (e **nem** Ao
      Vivo nem promessa de voz neural); `GET /api/billing/status` devolve `planosAVenda` com `essencial` e `premium`.
- [x] **Checkout do Essencial no sandbox** (staging `0b82814`, 21/10/2026): mensal R$ 9,90, o webhook concede o
      Essencial pelo valor, a troca para o Premium vale no próximo ciclo e o arrependimento de 7 dias devolve o valor.
      (Provado: R$ 9,90 pago → `essencial`, `active`, `valeAte` 26/11; estorno → `PAYMENT_REFUNDED` → `free`; o
      arrependimento do mensal estornou R$ 19,90 do Premium. A troca foi provada até a assinatura no Asaas ir ao valor
      novo com a troca pendente para 22/11 — o sandbox não gera a fatura seguinte na hora, então a virada do plano
      pelo pagamento novo segue coberta pelos testes de integração. Inventário de 21/10, §9.)
- [x] **Anúncio: página de bancada sem violação** (Chromium no staging, 21/10/2026; flag desligada: zero origem de terceiros em `/`, `/plano`, `/jogar`) (só antes de ligar `anuncios`): a página de bancada abre no Chrome real
      com o isolamento ligado, sem violação de CSP/COEP no console (`docs/auditoria/2026-10-21-anuncios-bancada.md`);
      com a flag desligada, nenhum byte de terceiro é pedido.
- [x] Testar as três chaves de emergência no staging (21/10/2026, 17:14–17:16Z, cada uma restaurada; o painel do
      Supabase fica com o dono): `AI_ENABLED=0` (tradução cai para o local),
      `CHECKOUT_ENABLED=0` (assinar responde 503 com mensagem), `SIGNUP_ENABLED=0` (conta nova recebe
      `cadastro_fechado`; desligar também o cadastro no painel do Supabase).

## 11-bis. Abrir a venda — passo a passo

Produção sobe fechada (§8): `SIGNUP_ENABLED=0` e `CHECKOUT_ENABLED=0`, `ANUAL_ENABLED` ausente, `anuncios`
desligada. Abra **na ordem**, uma porta por vez, conferindo antes de passar à próxima. Cada chave é um secret do
Worker; para trocar uma, `npx wrangler secret put NOME -c wrangler.jsonc` (produção é o ambiente raiz; vale na
próxima requisição, sem deploy). As mesmas portas, para fechar de volta, estão no
[runbook, "Abrir e fechar portas"](runbook.md#06-abrir-e-fechar-portas).

1. **Conferências do §10 fechadas**, em especial a cobrança real de R$ 5 com estorno, o convite ao responsável (sem ele,
   não abra para menores), as três chaves de emergência e as três caixas novas (3 cartões, checkout do Essencial no
   sandbox).
2. **Flags** (§8, passo 8): `flags listar` mostra `venda_planos_v3` ligada; `stt_ao_vivo`, `voz_natural` e `anuncios`
   desligadas.
3. **Cadastro — `SIGNUP_ENABLED`.** Primeiro o app: `npx wrangler secret put SIGNUP_ENABLED -c wrangler.jsonc` e digite
   `1` (ou apague o secret com `npx wrangler secret delete SIGNUP_ENABLED -c wrangler.jsonc`: ausente = aberto).
   **Em seguida o Supabase:** Authentication → Providers → Email → _Allow new users to sign up_ **ligado**. Teste criando
   uma conta nova: o e-mail chega, o login entra, o teste de 14 dias aparece em Planos.
4. **Venda — `CHECKOUT_ENABLED`.** Ainda sem anual: `npx wrangler secret put CHECKOUT_ENABLED -c wrangler.jsonc` com `1`.
   `venda_planos_v3` já está ligada (passo 2), então o Essencial e o Premium **mensais** passam a vender. Teste com a
   sua conta: assinar o mensal, o webhook concede o plano pelo valor, e `GET /api/billing/status` confere.
5. **Anual — `ANUAL_ENABLED=1`, só depois do jurídico.** Com os Termos §3–§4 validados (caixa do §10):
   `npx wrangler secret put ANUAL_ENABLED -c wrangler.jsonc` com `1`. O anual à vista e em 12x aparece em Planos; até lá o
   servidor responde 503 `anual_indisponivel`.
6. **Anúncios — flag `anuncios`, só depois do jurídico (ECA Digital) e da rede aprovada.** Antes: a página
   `frasy-anuncios` publicada em `ads.<domínio>` (§8, passo 9); o secret `ANUNCIOS_ORIGEM=https://ads.<domínio>` no Worker do app
   (`npx wrangler secret put ANUNCIOS_ORIGEM -c wrangler.jsonc`; a CSP lê a cada 60 s) e `VITE_ANUNCIOS_ORIGEM` na
   _variable_ do Environment `production` com um novo deploy do app; a caixa de bancada do §10 marcada. Então
   `node dist-server/operacao.cjs flags ligar anuncios` (ou Admin → Flags). Conferir com uma conta Grátis adulta: a folha
   de consentimento aparece; com perfil protegido, nada aparece. Para desfazer: `flags desligar anuncios`.
7. **Acompanhar** nas primeiras horas: `wrangler tail`, o Sentry e `GET /api/admin/ia`. Qualquer coisa estranha: feche a
   porta correspondente (`SIGNUP_ENABLED=0`, `CHECKOUT_ENABLED=0`) e siga o runbook §0.

## 11. Rotina depois do lançamento

| quando           | o quê                                                                                                                |
| ---------------- | -------------------------------------------------------------------------------------------------------------------- |
| todo dia útil    | olhar o Sentry (issues novas) e o gasto de IA (`GET /api/admin/ia` com token de admin)                               |
| toda semana      | revisar e aplicar os PRs do Dependabot (CI verde → deploy staging → production)                                      |
| todo mês         | restaurar o dump semanal à mão (runbook §0.2 e §8, uma vez por mês) e anotar; conferir as faturas contra esta tabela |
| a cada trimestre | `node scripts/modelos/revisoes.mjs` (modelos novos no Hub?); revisar a RoPA (`docs/lgpd/ropa.csv`)                   |

Chaves de emergência (runbook §0), todas por `npx wrangler secret put NOME -c wrangler.jsonc` (vale na próxima
requisição; volte com `1` ou `wrangler secret delete NOME`; reenviar o `.secrets.*.json` sem a chave não a apaga):

| chave                       | efeito                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------ |
| `AI_ENABLED=0`              | desliga toda IA de nuvem (tradução, transcrição, tutor); o app segue com os modelos locais |
| `CHECKOUT_ENABLED=0`        | fecha assinar e comprar; quem já paga segue com o plano                                    |
| `SIGNUP_ENABLED=0`          | recusa contas novas (`cadastro_fechado`); desligue também o cadastro no Supabase           |
| `AI_BUDGET_USD_MONTH=<US$>` | o teto do mês; alerta em 80 %, fecha a nuvem em 100 %                                      |
