# Staging — subir e conferir, na ordem

O roteiro enxuto para você subir o **staging** com as contas que já tem (Fly.io, Cloudflare/R2 e
domínio, Supabase com projeto criado, **Asaas sandbox**) e rodar as conferências da seção 10 do
[`LANCAMENTO.md`](LANCAMENTO.md). Este arquivo só dá a **ordem** e o que cada etapa prova; o "como
criar cada conta" continua no LANCAMENTO e é apontado a cada passo.

**Regra de ouro dos segredos.** Chave, token e senha **nunca** vão para o chat, para o repositório nem
para um print. Eles nascem no painel do serviço, vão para um arquivo **fora da pasta do projeto** e
daí para o Fly por `fly secrets import`. Os comandos abaixo foram escritos para isso: nenhum pede
para você digitar um segredo numa linha de comando (ela ficaria no histórico do PowerShell).

**Cadastro e venda FECHADOS no primeiro deploy** (`SIGNUP_ENABLED=0`, `CHECKOUT_ENABLED=0`). Só o
**staging** é aberto, e só no passo 9, para as conferências que precisam de conta e de cobrança de
mentira. A produção sobe fechada e só abre depois de tudo passar (passo 11).

Comandos: PowerShell, **uma linha por vez**, na pasta do projeto, **na mesma janela** (as variáveis
`$APP` e `$DOM` do passo 1 só existem nela).

---

## Sem domínio próprio (o staging no endereço do Fly)

Enquanto não houver domínio no Cloudflare, o staging sobe em `https://babel-play-staging.fly.dev`, **sem
Cloudflare na frente**. Use o [`fly.staging.toml`](../fly.staging.toml) e troque quatro coisas nos
passos abaixo:

- `TRUST_PROXY=1` (só o proxy do Fly). Com 2, o limitador por IP confiaria num salto que não existe.
- **Não defina `ORIGEM_SEGREDO`**: com ele o servidor responde 403 a quem chega direto no `fly.dev`,
  que aqui é o único caminho. O preflight avisa a ausência; é o esperado.
- `APP_URL=https://babel-play-staging.fly.dev`; no Supabase, a Redirect URL é
  `https://babel-play-staging.fly.dev/auth/callback`; no Asaas, o webhook é
  `https://babel-play-staging.fly.dev/api/billing/webhook/asaas`.
- Pule o passo 8 (certificado, DNS e regra de cabeçalho). A primeira conferência é só
  `https://babel-play-staging.fly.dev/api/ready` = 200.

O **R2 precisa estar habilitado** na conta do Cloudflare (painel → R2) antes de criar os buckets: com as
quatro `LITESTREAM_*` definidas, o container restaura e replica o banco no boot, e sem o bucket ele não sobe.

O token de conta do Cloudflare (`CLOUDFLARE_API_TOKEN`) **não** entra no arquivo importado para o Fly:
o servidor lê `CLOUDFLARE_*` como perna de IA. Ele fica num arquivo à parte (`.env.infra`).

Deploy local, com as duas variáveis públicas no build (lidas do arquivo, sem digitá-las):

```powershell
$v = Get-Content "$HOME\segredos\babel\.env.staging" | ConvertFrom-StringData
fly deploy -c fly.staging.toml --build-arg "VITE_SUPABASE_URL=$($v.VITE_SUPABASE_URL)" --build-arg "VITE_SUPABASE_ANON_KEY=$($v.VITE_SUPABASE_ANON_KEY)"
```

Ficam para quando houver domínio: WAF, a regra de rate limit, o bloqueio do `fly.dev`, o Google e o captcha.

## 1. O terminal

```powershell
cd C:\Users\Guilh\dev\ei-quest
$APP = "babel-play-staging"
$DOM = "staging.SEU-DOMINIO.com.br"
$SEGREDOS = "$HOME\segredos\babel"
fly auth login
New-Item -ItemType Directory -Force $SEGREDOS
```

Troque `SEU-DOMINIO.com.br` pelo seu. A pasta `$SEGREDOS` fica **fora** do repositório.

## 2. O app no Fly (LANCAMENTO §8, passos 1, 2 e 4)

```powershell
fly apps create $APP
fly volumes create babel_dados --app $APP --region gru --size 1
fly ips allocate-v6 --app $APP
```

## 3. R2 e Supabase (LANCAMENTO §2 e §3)

- **R2** (Cloudflare → R2): três buckets **só do staging**: `babel-staging-midia`,
  `babel-staging-backups`, `babel-staging-litestream`; um token de API de R2 com leitura e escrita
  só neles. Anote Endpoint, Access Key ID e Secret **no arquivo do passo 5**, nunca aqui.
- **Supabase**: no projeto que você já criou, em _Authentication → URL Configuration_, acrescente
  `https://staging.SEU-DOMINIO.com.br/auth/callback` em **Redirect URLs** (a _Site URL_ fica a da
  produção). Confira _Confirm email_ **ligado** e o **Google** configurado com a origem do staging
  (LANCAMENTO §3, passo 3). Anote URL do projeto, **anon key** e **service role key** no arquivo.

## 4. Asaas **sandbox** (LANCAMENTO §6, passos 2 e 3, no painel do sandbox)

No painel **sandbox** do Asaas (`sandbox.asaas.com`, conta própria do sandbox):

1. _Integrações → Chave de API_ → gere a chave (começa com `$aact_hmlg_`).
2. _Integrações → Webhooks_ → novo: URL `https://staging.SEU-DOMINIO.com.br/api/billing/webhook/asaas`,
   v3, eventos de **cobrança** e de **assinatura**, _authToken_ = um segredo seu (gere no passo 5 e
   use o **mesmo** valor nos dois lugares), fila de sincronização **ligada**.

## 5. O arquivo de variáveis, fora do repositório

Gere os três segredos próprios **direto para a área de transferência** (um por vez; cole no arquivo
com Ctrl+V; não os leia em voz alta, não os cole em chat):

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" | clip
```

Repita para `SECRET_KEY`, `ORIGEM_SEGREDO` e `ASAAS_WEBHOOK_TOKEN`. **Guarde a `SECRET_KEY` no cofre
de senhas**: perdê-la torna ilegíveis as chaves que os usuários guardaram (LANCAMENTO §8).

```powershell
notepad "$SEGREDOS\.env.staging"
```

Conteúdo (os `troque-` são de propósito: o preflight acusa o que você esqueceu de trocar):

```
NODE_ENV=production
SECRET_KEY=troque-cole-aqui
ORIGEM_SEGREDO=troque-cole-aqui
TRUST_PROXY=2
AUTH_REQUIRED=1
SIGNUP_ENABLED=0
CHECKOUT_ENABLED=0
APP_URL=https://staging.SEU-DOMINIO.com.br
SUPABASE_URL=troque-url-do-projeto
SUPABASE_SERVICE_ROLE_KEY=troque-cole-aqui
VITE_SUPABASE_URL=troque-a-mesma-url-do-projeto
VITE_SUPABASE_ANON_KEY=troque-cole-aqui
VITE_TURNSTILE_SITE_KEY=troque-cole-aqui
ASAAS_BASE_URL=https://api-sandbox.asaas.com/v3
ASAAS_API_KEY=troque-cole-aqui
ASAAS_WEBHOOK_TOKEN=troque-cole-aqui
S3_ENDPOINT=troque-cole-aqui
S3_BUCKET=babel-staging-midia
S3_ACCESS_KEY_ID=troque-cole-aqui
S3_SECRET_ACCESS_KEY=troque-cole-aqui
BACKUP_DIARIO=1
BACKUP_S3_BUCKET=babel-staging-backups
BACKUP_HEARTBEAT_URL=troque-url-do-heartbeat
LITESTREAM_BUCKET=babel-staging-litestream
LITESTREAM_ENDPOINT=troque-cole-aqui
LITESTREAM_ACCESS_KEY_ID=troque-cole-aqui
LITESTREAM_SECRET_ACCESS_KEY=troque-cole-aqui
LLM_BASE_URL=https://api.groq.com/openai/v1
LLM_API_KEY=troque-cole-aqui
LLM_MODEL=openai/gpt-oss-120b
LLM_RESERVA_BASE_URL=https://openrouter.ai/api/v1
LLM_RESERVA_API_KEY=troque-cole-aqui
LLM_RESERVA_MODEL=openai/gpt-oss-120b
AI_BUDGET_USD_MONTH=5
AI_BUDGET_USD_DAY=1
RESEND_API_KEY=troque-cole-aqui
EMAIL_REMETENTE=Babel Play <nao-responda@SEU-DOMINIO.com.br>
SENTRY_DSN=troque-cole-aqui
```

(`SEU-DOMINIO` nos valores também precisa ser trocado: o preflight só enxerga os `troque-`.)
O que cada variável faz: [`.env.production.example`](../.env.production.example).

### O preflight

```powershell
npm run preflight -- "$SEGREDOS\.env.staging"
```

Ele diz, **só pelos nomes**, o que **BLOQUEIA** o boot, o que **AVISA** (capacidade que fica
desligada) e o que está **OK**, e nunca imprime um valor. O arquivo dentro do repositório é recusado.
Código de saída 0 = nada bloqueia. **Corrija todo BLOQUEIA e repita até passar.** No staging é
esperado um AVISA em `ASAAS_BASE_URL` ("sandbox em produção?"): é o sandbox, de propósito. Os
`SIGNUP_ENABLED`/`CHECKOUT_ENABLED` aparecem como **FECHADO** (OK).

## 6. Os segredos no Fly

```powershell
Get-Content "$SEGREDOS\.env.staging" | fly secrets import --app $APP
```

(O Fly guarda; o arquivo continua só na sua máquina. Para trocar um valor depois, edite o arquivo,
rode o preflight e importe de novo.)

## 7. GitHub: o ambiente `staging` e o deploy (LANCAMENTO §8, passos 3 e 5)

```powershell
fly tokens create deploy --app $APP | clip
```

No GitHub: _Settings → Environments → **staging**_ → _secret_ `FLY_API_TOKEN` (Ctrl+V) e as
_variables_ `FLY_APP` = `babel-play-staging`, `URL_PUBLICA` = `https://staging.SEU-DOMINIO.com.br`,
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_TURNSTILE_SITE_KEY` (as `VITE_*` são **públicas
por desenho** e vão para o navegador; elas são embutidas no build, por isso moram aqui e também no
arquivo acima). Depois: _Actions → **Deploy (Fly.io)** → Run workflow → destino `staging`_. A rotina
tira snapshot do volume, implanta, confere `/api/ready` e volta sozinha para a imagem anterior se a
fumaça falhar.

## 8. Cloudflare na frente do staging (LANCAMENTO §9, passos 1 e 2)

```powershell
fly certs add $DOM --app $APP
fly certs check $DOM --app $APP
```

No DNS do Cloudflare: `CNAME staging → babel-play-staging.fly.dev` **proxied** (nuvem laranja), mais
o `_acme-challenge` que o Fly mostrar (nuvem cinza). Depois, _Rules → Modify Request Header_ só para
o host `staging.SEU-DOMINIO.com.br`: `x-origem-segredo` = o `ORIGEM_SEGREDO` do arquivo (copie do
arquivo, não do chat).

Primeira conferência, ainda **fechado**:

```powershell
curl.exe -s -o NUL -w "%{http_code}`n" https://$DOM/api/ready
curl.exe -s -o NUL -w "%{http_code}`n" https://$APP.fly.dev/
fly logs --app $APP
```

Esperado: `200`, `403` (quem pula a Cloudflare é barrado) e, nos logs, **nenhum** `ABORTADO`.

## 9. Abrir só o staging, e virar admin

O staging usa dinheiro de mentira e contas suas: pode abrir para as conferências. **A produção não.**

```powershell
fly secrets set SIGNUP_ENABLED=1 CHECKOUT_ENABLED=1 --app $APP
```

Crie a **sua conta** pelo app (`https://staging.SEU-DOMINIO.com.br`), confirme o e-mail e entre. Depois,
vire admin (o papel mora no banco do servidor, não no Supabase):

```powershell
fly ssh console --app $APP -C "node dist-server/operacao.cjs conta papel SEU-EMAIL@exemplo.com admin"
fly ssh console --app $APP -C "node dist-server/operacao.cjs conta listar"
```

Saia e entre de novo no app: o painel de admin aparece.

## 10. As conferências da seção 10 do LANCAMENTO, nesta ordem

Cada item está no [`LANCAMENTO.md` §10](LANCAMENTO.md#10-conferências-antes-de-abrir--30-min); aqui
só a ordem (cada uma prepara a seguinte) e o que fica para a produção.

1. **`/api/ready` 200 e `fly.dev` 403** (já feito no passo 8).
2. **Conta, e-mail do Supabase, entrar, 2FA**, sair e entrar pedindo o código. Faça com a conta do passo 9.
3. **Gravar uma sessão curta** → o áudio aparece no bucket `babel-staging-midia`.
4. **Threads do WASM** (`crossOriginIsolated` = `true` no console da página).
5. **Convite ao responsável** (precisa de Resend): `fly logs --app $APP` sem `[convite] AVISO`; conta de
   15 anos; e-mail na caixa de entrada (não no spam), `spf`/`dkim`/`dmarc` = pass; o responsável aceita.
6. **Os três ciclos no sandbox**: mensal, anual e anual em 12x com o cartão de teste do Asaas; fim do
   período (35 d / 370 d); arrependimento de 7 dias. **Conte quantos webhooks o 12x manda** e anote:
   é a única medição que falta (LANCAMENTO §10).
7. **O teste de 14 dias** numa conta nova; apagar e recriar com o mesmo e-mail **não** renova.
8. **Excluir uma conta com reembolso pendente**: a exclusão responde 409 `estorno_pendente` e não
   apaga nada (provoque com um estorno que o sandbox recuse).
9. **As três chaves de emergência**: `AI_ENABLED=0`, `CHECKOUT_ENABLED=0`, `SIGNUP_ENABLED=0`.
10. **Forçar um erro** e ver o evento no Sentry **sem** e-mail nem IP.
11. **ZAP Baseline** (Actions → _ZAP Baseline (staging)_ com a URL do staging) e triar.
12. **No dia seguinte**: `backups/diario/<data>.db.gz` no bucket `babel-staging-backups` e o heartbeat verde.
13. **Restaurar o backup** num arquivo à parte e anotar a data no runbook (runbook §0.2-A):

```powershell
fly ssh console --app $APP -C "node dist-server/operacao.cjs snapshot"
fly ssh console --app $APP -C "node dist-server/operacao.cjs restaurar-snapshot --dia=AAAA-MM-DD --destino=/data/restauro.db"
fly ssh console --app $APP -C "node dist-server/operacao.cjs verificar --arquivo=/data/restauro.db"
```

Troque `AAAA-MM-DD` pelo dia do snapshot. Esperado: `integrity_check` ok e contagens plausíveis.

**Só na produção** (o staging não substitui): cobrança real de R$ 5 e estorno, os DPAs, o parecer
do jurídico sobre os Termos §3-§4 (**sem ele, não abra a venda do anual**), os alertas de fatura.

## 11. Depois do staging

Repita os passos 1 a 8 para a produção (app `babel-play`, domínio sem `staging.`, chave do Asaas de
**produção** `$aact_prod_` e `ASAAS_BASE_URL=https://api.asaas.com/v3`) com
`SIGNUP_ENABLED=0` e `CHECKOUT_ENABLED=0`; o preflight da produção não deve ter nenhum AVISA em
`ASAAS_BASE_URL`. Só com as conferências de produção passando: `SIGNUP_ENABLED=1` (e, no Supabase,
o cadastro ligado) e, mais tarde, `CHECKOUT_ENABLED=1`.

---

## O que o staging prova que a vitrine não prova

A vitrine (`npm run vitrine`) roda o app inteiro, mas com **Supabase e Asaas de mentira** na sua
máquina. O staging é o primeiro lugar onde estes pontos falam com o mundo de verdade:

- **Os webhooks reais do 12x**: o Asaas de verdade confirma as parcelas (quantos eventos, em que
  ordem, com que `installment`), e o servidor confere cada um na API. O falso da vitrine manda o
  que nós mandamos fazer.
- **O e-mail de confirmação do Supabase**: chega, não cai no spam, e o link volta para
  `/auth/callback` do domínio certo (Site URL e Redirect URLs).
- **O login com o Google**: o OAuth com origem e redirect reais.
- **O captcha (Turnstile)** do convidado, com a chave pública do domínio e a CSP liberando o desafio.
- **O Resend**: o convite ao responsável sai de verdade, com SPF, DKIM e DMARC passando e o link
  sem ser reescrito.
- **A restauração do backup**: o snapshot diário e a réplica contínua existem no R2, e **voltam** num
  arquivo à parte, íntegros. Um backup que nunca foi restaurado ainda não é um backup.
- Também: a **borda** (Cloudflare + segredo de origem, `fly.dev` barrado), o **R2** como destino do áudio,
  as **threads do WASM** com os cabeçalhos reais, o **TRUST_PROXY=2** com o IP certo no limitador e o
  **ZAP** contra um servidor de verdade.
