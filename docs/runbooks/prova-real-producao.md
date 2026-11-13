# Prova real em produção — roteiro para o dono executar com o assistente

Objetivo: antes de abrir o cadastro e a venda, provar em `https://frasy.com.br` que o login real, um pagamento real com
estorno e as conferências de lançamento funcionam, e fechar tudo de novo no fim. Este roteiro **não abre nada sozinho**:
cada porta é aberta pelo dono, pelo tempo da prova, e fechada no passo seguinte.

Fontes (se divergirem, o código vence): [`LANCAMENTO.md` §10 e §11-bis](../LANCAMENTO.md),
[`runbook.md` §0, §0.1-bis, §0.3 e §0.6](../runbook.md), [`deploy.md`](../deploy.md),
[`flags.md`](../flags.md), [`ESTADO-DO-LANCAMENTO.md`](../ESTADO-DO-LANCAMENTO.md) e a
[lista de pendências de 02/11](../planejamento/2026-11-02-pendencias-para-100-por-cento.md).
O que está marcado **A CONFIRMAR** o repositório não responde: o dono confere no painel antes do passo.

Produção é o ambiente raiz do `wrangler.jsonc`: todo comando `wrangler` aqui leva `-c wrangler.jsonc` e **nunca**
`--env staging`.

---

## 0. A conferência somente-leitura (antes, durante e depois)

```bash
node scripts/producao/conferir-producao.mjs --url https://frasy.com.br --esperar-fechado
```

São 11 GETs/HEAD públicos (12 com `--origem <url-direta-do-worker>`), sem login e sem nenhuma rota que responda 401:
`/api/health`, `/api/ready`, `/api/abertura`, `/api/flags`, `/` (CSP, HSTS, `X-Content-Type-Options`, COOP/COEP/DIP),
`/app`, `/planos`, `/robots.txt`, `/sitemap.xml`, `/ads.txt` (informativo) e um HEAD em
`https://modelos.frasy.com.br/supertonic-3/onnx/tts.json` (8.253 bytes, o primeiro arquivo de
`src/core/voz/supertonic.ts`). Sai com 1 se algo crítico falhar. Com `--esperar-fechado`, reprova se cadastro, venda
ou anual estiverem abertos, ou se uma flag de venda, IA, anúncio ou avatar estiver ligada **para um visitante sem conta**
(uma flag ligada só para uma lista de ids não aparece aqui; a lista completa é `flags listar`).

Regra: **uma execução por momento** (antes da prova, com as portas abertas sem `--esperar-fechado`, e no fim). Nada de
laço: o IP do dono é o mesmo dos testes manuais.

---

## 1. Pré-condições (nada começa sem todas marcadas)

| #   | Pré-condição                                                                                                                                                                                                                                                                             | Como conferir                                                                                                     | Quem       |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------- |
| P1  | A versão que vai ser provada está publicada em produção. Em 13/11 a produção servia `0.1.0+6debabe`, atrás da `main`. Decida se prova essa ou publica a `main` antes (Actions → **deploy-worker** → `ambiente=production`, com a aprovação do Environment).                              | `/api/health` → `versao` termina no SHA esperado (a conferência mostra).                                          | dono       |
| P2  | Secrets de produção com **nomes** presentes: `ASAAS_API_KEY` (chave de produção, `$aact_prod_…`), `ASAAS_WEBHOOK_TOKEN`, `RESEND_API_KEY`, `EMAIL_REMETENTE`, `APP_URL`, `ALERTA_EMAIL_DESTINO`. Em 02/11 **faltavam** todos menos o `ASAAS_WEBHOOK_TOKEN`.                              | `npx wrangler secret list -c wrangler.jsonc` (mostra só nomes; nunca cole valores no chat).                       | dono       |
| P3  | `ASAAS_BASE_URL` de produção (`https://api.asaas.com/v3`) e sem `ASAAS_SANDBOX`. Sem isso o boot aborta ou cobra no sandbox (`server/lib/config.ts`, `sandboxDoAsaasIndeclarado`).                                                                                                       | `wrangler.jsonc` (vars do ambiente raiz) e `npx wrangler tail -c wrangler.jsonc` sem `ABORTADO` depois do deploy. | assistente |
| P4  | Webhook do Asaas de produção: URL `https://frasy.com.br/api/billing/webhook/asaas`, v3, eventos de cobrança e assinatura, `authToken` = o `ASAAS_WEBHOOK_TOKEN`, fila **ligada** e **não pausada**. Juros e multa zerados (LANCAMENTO §6).                                               | Painel do Asaas → Integrações → Webhooks.                                                                         | dono       |
| P5  | Nenhuma assinatura manual antiga a R$ 39,90 ou R$ 179 no Asaas (decisão aberta 2 do ESTADO).                                                                                                                                                                                             | Painel do Asaas → Assinaturas.                                                                                    | dono       |
| P6  | E-mail funcionando: domínio verificado no Resend (SPF, DKIM, DMARC) e o SMTP do Supabase apontando para o Resend (LANCAMENTO §4).                                                                                                                                                        | Painel do Resend → Domains "Verified"; Supabase → Auth → SMTP.                                                    | dono       |
| P7  | Backup recente: o último `semanal/AAAA-MM-DD.dump` no `frasy-backups` com menos de 8 dias e o `backup-pg-dump.yml` verde.                                                                                                                                                                | `gh run list --workflow backup-pg-dump.yml --limit 3`                                                             | assistente |
| P8  | Tetos de IA definidos: `AI_BUDGET_USD_MONTH` e `AI_BUDGET_USD_DAY` (o modelo em `.env.production.example` é 40 e 4). `TETO_USD_MES_*` é opcional e nasce desligado (decisão aberta 10). A prova **não usa IA de nuvem**; sem chave de IA em produção, a nuvem simplesmente não responde. | `npx wrangler secret list -c wrangler.jsonc` (nomes).                                                             | dono       |
| P9  | Conta de teste **ADULTA**: e-mail do próprio dono (ex.: um alias `+prova`), data de nascimento de adulto, CPF e cartão do próprio dono. Perfil protegido não compra (`recusouPerfilProtegido`).                                                                                          | —                                                                                                                 | dono       |
| P10 | Uma conta **admin** com 2FA confirmado para ver Admin → Cobrança e Admin → Flags (`node dist-server/operacao.cjs conta papel <e-mail> admin`, LANCAMENTO §8.8).                                                                                                                          | Admin abre sem pedir o 2FA de novo.                                                                               | dono       |
| P11 | Google como provedor no Supabase (Authentication → Providers → Google) e a variable `VITE_LOGIN_GOOGLE` **ausente** (ou diferente de `0`) no Environment `production`. Em 02/11 o Google OAuth estava pendente. **A CONFIRMAR** no painel.                                               | O botão "Continuar com Google" aparece no `/app`.                                                                 | dono       |
| P12 | A conferência somente-leitura passa com `--esperar-fechado` (0 falhas).                                                                                                                                                                                                                  | §0.                                                                                                               | assistente |
| P13 | Janela tranquila de ~1 h, com o dono no computador e no celular (código do 2FA, e-mail, app do banco).                                                                                                                                                                                   | —                                                                                                                 | dono       |

## 2. Quem faz o quê

- **Dono**: tudo que tem segredo, dinheiro ou painel. Digita os `wrangler secret put` (o valor é digitado no prompt,
  nunca colado no chat), usa o próprio cartão, mexe no Supabase, no Asaas e no Resend, lê os e-mails, assina o relatório.
- **Assistente**: roda a conferência somente-leitura, prepara cada comando antes do passo, lê os Workers Logs
  (`npx wrangler tail -c wrangler.jsonc --format pretty`, linhas já saneadas, sem e-mail nem token), confere o checklist,
  cronometra as janelas abertas e escreve o relatório. Não recebe segredo, não vê o cartão, não faz login com a conta
  do dono.

Anote a **hora (UTC)** de cada abertura e fechamento: vai para o relatório.

---

## 3. Passo a passo

### Bloco A — conferir antes de mexer

1. **Conferência.** Assistente roda o §0. _Esperado:_ 0 falhas, `cadastro=fechado, checkout=fechado, anual=fechado`, só
   `oferta_planos` ligada. _Se falhar:_ pare aqui.
2. **Logs abertos.** Assistente abre `npx wrangler tail -c wrangler.jsonc --format pretty` e deixa rodando a prova toda.
   _Esperado:_ sem `ABORTADO`, sem `ia_sem_reserva` repetido além de 1 por dia.

### Bloco B — e-mail de alerta (antes de qualquer dinheiro)

3. **Alerta de propósito.** Uma única chamada com token errado no webhook (gera `billing_webhook_token_invalido`, que
   alerta por e-mail; conta 1 das 30 falhas por IP em 15 min do limitador, e não mexe na fila do Asaas, porque não vem
   do Asaas):
   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' -X POST https://frasy.com.br/api/billing/webhook/asaas -H 'asaas-access-token: prova-errado-de-proposito' -H 'content-type: application/json' -d '{}'
   ```
   _Esperado:_ `401`; o log `billing_webhook_token_invalido` no tail; em até ~5 min um e-mail em `ALERTA_EMAIL_DESTINO`
   com assunto do evento e um `requestId`. _Verificar:_ o `requestId` do e-mail aparece no tail. _Se não chegar:_ pare;
   sem alerta, um webhook quebrado durante a prova passaria em silêncio. Não repita o `curl` (um e-mail por evento por
   hora, `server/lib/alertaPorEmail.ts`).

### Bloco C — cadastro e login

O portão do cadastro (`server/lib/abertura.ts`, `portaDoCadastro`) é **global**: com `SIGNUP_ENABLED=0`, toda conta que
o banco ainda não conhece recebe 403 `cadastro_fechado`. **Não existe lista de ids** para o cadastro (as flags têm,
o `SIGNUP_ENABLED` não). Então a prova abre a porta por uma janela curta. Duas formas:

- **C-1 (recomendada, prova o fluxo real):** abrir o app (`SIGNUP_ENABLED=1`) **e** o Supabase ("Allow new users to sign
  up") por no máximo 15 min. Risco: qualquer pessoa pode criar conta na janela (o Turnstile ainda não está no build).
  Baixo com o site sem divulgação, e quem entrar fica no Grátis, porque a venda segue fechada.
- **C-2 (sem exposição):** deixar o Supabase fechado, criar a conta de teste à mão no painel (Authentication → Users →
  Add user → Create new user, com "Auto Confirm"; **A CONFIRMAR** que o painel cria usuário com o cadastro público
  desligado) e abrir só o `SIGNUP_ENABLED=1` pelos minutos do primeiro login. Não prova o e-mail de confirmação.

4. **Abrir (C-1).** Dono: `npx wrangler secret put SIGNUP_ENABLED -c wrangler.jsonc` → digita `1`; Supabase →
   Authentication → Providers → Email → _Allow new users to sign up_ **ligado**. Anote a hora.
   _Verificar:_ `curl -s https://frasy.com.br/api/abertura` → `"cadastro":true` (vale na próxima requisição).
5. **Criar a conta por e-mail.** Dono, numa janela anônima: `https://frasy.com.br/app` → Criar conta → e-mail de teste
   e senha → informa a data de nascimento de adulto. _Esperado:_ o e-mail de confirmação chega pelo Resend na caixa de
   entrada (não spam), nos cabeçalhos `spf=pass`, `dkim=pass`, `dmarc=pass`; o link leva a
   `https://frasy.com.br/auth/callback` e o app entra. _Verificar:_ no tail, nenhuma linha `cadastro_fechado` para
   essa sessão.
6. **Fechar o cadastro.** Logo depois do primeiro login (a linha da conta já existe no banco): `SIGNUP_ENABLED` → `0` e
   Supabase → _Allow new users to sign up_ **desligado**. Anote a hora. _Verificar:_ `/api/abertura` →
   `"cadastro":false`. A conta de teste segue entrando (o portão só barra conta desconhecida).
7. **2FA.** Ajustes → Conta → ativar o 2FA (TOTP), sair, entrar de novo: o app pede o código. _Esperado:_ entra com o
   código; sem ele, não.
8. **Login com Google** (só se P11 estiver ok). Sair → "Continuar com Google" com uma conta Google cujo e-mail **já é o
   da conta de teste** (o Supabase liga as identidades pelo e-mail confirmado; **A CONFIRMAR** que a ligação funciona com
   o cadastro público desligado, senão faça este passo dentro da janela do passo 4). _Esperado:_ entra na MESMA conta
   (o mesmo histórico). Se uma conta Google nova for usada fora da janela, o esperado é `cadastro_fechado`: isso também
   prova o portão.

### Bloco D — pagamento real, concessão, estorno e revogação

**Não existe plano nem valor de R$ 5 no código.** O plano é identificado pelo valor pago e todo valor cobrável é
único (`src/core/planos.ts`, `tests/planos-matriz.test.ts`); um valor novo só para a prova seria mudança de preço,
com teste e spec, e não deve entrar por atalho. Uma cobrança manual de R$ 5 criada no painel do Asaas chegaria ao
webhook sem compra registrada e terminaria `nao-aplicado` (`billing_evento_nao_aplicado`): provaria o alerta, não a
concessão. Os caminhos seguros, do mais simples ao mais barato:

| opção            | valor    | o que precisa                                                                                                                                                                                                                                                             | prova                               |
| ---------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| **D-1 (recom.)** | R$ 19,90 | nada além do `CHECKOUT_ENABLED=1`: o Premium mensal não tem flag de venda (`flagsDeVenda` vazio) e é o que a produção vende hoje                                                                                                                                          | assinatura, webhook, arrependimento |
| D-2              | R$ 9,90  | ligar `venda_planos_v3` **só para o id da conta de teste**: `node dist-server/operacao.cjs flags definir venda_planos_v3 '{"habilitada":true,"regras":{"ids":["<id>"],"percentual":0}}'` (formato em `docs/flags.md`; **A CONFIRMAR** que `definir` preserva a descrição) | o mesmo, com o Essencial            |
| D-3              | R$ 9,90  | pacote `c100` (`/api/billing/comprar`, `src/core/creditos.ts`)                                                                                                                                                                                                            | só a cobrança avulsa, não plano     |

O estorno do arrependimento (até 7 dias) devolve o valor cheio pelo app. A taxa do Asaas sobre uma transação de
cartão estornada: **A CONFIRMAR** no contrato do Asaas.

`CHECKOUT_ENABLED` também é global: na janela, qualquer conta existente poderia assinar. Com o cadastro fechado, são
só as contas que já existem.

9. **Abrir a venda.** Dono: `npx wrangler secret put CHECKOUT_ENABLED -c wrangler.jsonc` → `1` (e, se D-2, a flag por
   id). Anote a hora. _Verificar:_ `/api/abertura` → `"checkout":true,"anual":false`.
10. **Assinar.** Na conta de teste: Planos → Premium mensal (D-1) → nome e CPF do dono → abre a fatura do Asaas → paga
    com o cartão do dono. _Esperado:_ a tela volta para o app; no tail, `billing_webhook_ok` com
    `PAYMENT_CONFIRMED → aplicado` (ou `PAYMENT_RECEIVED`), sem `billing_evento_nao_aplicado`.
11. **Concessão.** No app da conta de teste: o selo "Premium · mensal" e o fim do período (vencimento + 35 d, como no
    sandbox). No navegador logado, `https://frasy.com.br/api/billing/status` pela aba Rede do DevTools (o assistente
    não chama rota autenticada) → plano `premium`, `status: active`. _Verificar também:_ Admin → Cobrança sem pendentes;
    painel do Asaas → a cobrança "Confirmada" e o webhook com resposta 200 no histórico.
12. **Fechar a venda.** `CHECKOUT_ENABLED` → `0` (e `flags desligar venda_planos_v3`, se D-2). Anote a hora.
    _Verificar:_ `/api/abertura` → `"checkout":false`. A conta de teste segue Premium (fechar a venda não tira o plano).
13. **Estorno e revogação.** Na conta de teste: Planos → Cancelar (dentro dos 7 dias = arrependimento; `/api/billing/cancelar`
    não exige a venda aberta). _Esperado:_ a tela confirma o arrependimento; no Asaas a assinatura é removida e a cobrança
    fica "Estornada"; no tail, o `PAYMENT_REFUNDED` aplicado; o plano volta a `free` no `/api/billing/status`.
    _Se o cancelamento pelo app falhar:_ estorne no painel do Asaas **e** exclua a assinatura lá (senão o mês seguinte é
    cobrado), e registre no relatório.
14. **Reconciliação.** O job `reconciliarCobrancas` roda pelo cron `29 3 * * *` (UTC) no Worker, em modo `report`
    (`BILLING_RECONCILE_MODE`). No dia seguinte, nos Workers Logs (painel → Workers → `frasy` → Logs), procure o
    `job_fim` do `reconciliarCobrancas`. _Esperado:_ `divergentes: 0` (o webhook chegou) e nenhum e-mail
    `billing_reconciliacao_divergente`. Rodar à mão (`npm run job -- reconciliarCobrancas`) exige a `DATABASE_URL` e a
    `ASAAS_API_KEY` de produção na máquina: **não recomendado**; o cron basta.

### Bloco E — limpeza

15. **Excluir a conta de teste.** Ajustes → Conta → "Excluir a conta" (`DELETE /api/me` com `{"confirmar":true}`).
    _Esperado:_ a resposta lista as tabelas apagadas; com estorno ainda pendente a rota responde 409
    `estorno_pendente` e não apaga nada (espere o `PAYMENT_REFUNDED`). _Verificar:_ o usuário some do Supabase
    (Authentication → Users) e de `node dist-server/operacao.cjs conta listar`. Ficam por desenho: a marca do teste de 14
    dias (HMAC do e-mail) e o cadastro do cliente no Asaas (apagar o cliente lá: **A CONFIRMAR** se o dono quer).
16. **Conferência final.** Assistente roda o §0 com `--esperar-fechado`. _Esperado:_ 0 falhas, tudo fechado.

---

## 4. As conferências do LANCAMENTO §10

O ESTADO e a lista de 02/11 falam em "16 conferências"; o §10 tem hoje **19 caixas** (algumas entraram depois). Estão
todas aqui, na ordem do §10. `[x]` = já marcada no §10 (staging, 21/10); repetir em produção onde dito.

| #   | Conferência                                         | Comando / onde                                                                                            | Aceite                                                                                 | Nesta prova?                       |
| --- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------- |
| 1   | `/api/ready` 200; origem direta sem cabeçalho → 403 | §0 (`--origem <url-direta>`; a URL `*.workers.dev` da produção: **A CONFIRMAR** se está ligada)           | ready 200; origem direta 403                                                           | sim                                |
| 2   | Conta, e-mail pelo Resend, 2FA                      | passos 4–7                                                                                                | e-mail na caixa de entrada; o app pede o código                                        | sim                                |
| 3   | Sessão curta grava áudio no `frasy-midia`           | gravar 10 s na conta de teste; R2 → `frasy-midia`                                                         | o objeto aparece (e some na exclusão do passo 15)                                      | sim, antes do passo 15             |
| 4   | [x] Threads do WASM                                 | console: `crossOriginIsolated`; §0 confere COOP/COEP/DIP                                                  | `true` no Chrome/Firefox                                                               | repetir em produção (console)      |
| 5   | Backup semanal no `frasy-backups`                   | `gh run list --workflow backup-pg-dump.yml --limit 3`                                                     | último run verde e dump com < 8 dias                                                   | P7                                 |
| 6   | Restaurar o dump num banco descartável              | runbook §0.2 e §8                                                                                         | `pg_restore --list` sem erro; contagens coerentes; data anotada                        | não (sessão própria)               |
| 7   | [x] ZAP Baseline                                    | Actions → ZAP Baseline                                                                                    | 0 FAIL                                                                                 | não                                |
| 8   | Cobrança real com estorno                           | Bloco D (R$ 19,90 ou R$ 9,90; não há R$ 5)                                                                | plano pelo webhook, estorno, volta a `free`                                            | sim                                |
| 9   | [x] Três ciclos no sandbox                          | —                                                                                                         | —                                                                                      | não (anual fechado)                |
| 10  | [x] Teste de 14 dias                                | numa conta nova: Planos → teste                                                                           | "Premium · em teste", nada no Asaas                                                    | opcional (gasta a marca do e-mail) |
| 11  | Termos §3–§4 validados                              | jurídico                                                                                                  | parecer escrito                                                                        | não (sem isso, anual fica fechado) |
| 12  | Erro de teste no Sentry sem e-mail nem IP           | depende de `SENTRY_DSN`/`VITE_SENTRY_DSN` (ausentes em 02/11)                                             | evento sem PII                                                                         | só se o Sentry existir             |
| 13  | DPAs aceitos e `docs/lgpd/operadores.md`            | painéis dos operadores                                                                                    | todos marcados                                                                         | não                                |
| 14  | Alerta de fatura (Cloudflare, Supabase, Sentry)     | painéis                                                                                                   | os três ligados                                                                        | conferir                           |
| 15  | Convite ao responsável por e-mail                   | conta de 15 anos (LANCAMENTO §10): **não** nesta prova                                                    | e-mail chega, aceite libera a nuvem                                                    | não (prova própria; menores)       |
| 16  | 3 cartões na produção                               | conta Grátis → Planos; `/api/billing/status` → `planosAVenda`                                             | cartões e `planosAVenda` coerentes com as flags escolhidas (v3 ou v4: decisão do dono) | sim, na janela do passo 9          |
| 17  | [x] Checkout do Essencial no sandbox                | —                                                                                                         | —                                                                                      | não                                |
| 18  | [x] Bancada de anúncios                             | —                                                                                                         | flag `anuncios` desligada (§0)                                                         | §0                                 |
| 19  | [x] Três chaves de emergência                       | no staging foi feito; em produção, os passos 4, 6, 9 e 12 exercitam `SIGNUP_ENABLED` e `CHECKOUT_ENABLED` | 403 `cadastro_fechado` / 503 `checkout_desligado` fechados                             | sim (as duas)                      |

---

## 5. Critérios de parada e fechamento em 1 minuto

**Pare a prova e feche** se acontecer qualquer um destes:

- a conferência do §0 falhar em algo crítico;
- o e-mail de alerta do passo 3 não chegar;
- o pagamento confirmar no Asaas e o plano não vier em 5 min, ou aparecer `billing_evento_nao_aplicado`,
  `billing_webhook_marca_presa`, `billing_*_divergente` ou `billing_*_ambigua` no tail;
- um 5xx em rota de cobrança, `ABORTADO` no tail, ou cobrança em valor diferente do anunciado;
- contas desconhecidas aparecendo na janela do cadastro.

**Fechar (cada linha vale na próxima requisição, sem deploy):**

```bash
npx wrangler secret put CHECKOUT_ENABLED -c wrangler.jsonc   # digite 0
npx wrangler secret put SIGNUP_ENABLED -c wrangler.jsonc     # digite 0
```

- Supabase → Authentication → Providers → Email → _Allow new users to sign up_ **desligado**.
- Se usou D-2: `node dist-server/operacao.cjs flags desligar venda_planos_v3`.
- IA gastando (não deveria, a prova não usa): `AI_ENABLED` → `0`.
- Conferir: `curl -s https://frasy.com.br/api/abertura` → tudo `false`; depois o §0 com `--esperar-fechado`.

**Deploy ruim** (se P1 publicou uma versão nova e ela quebrou): runbook §0.3, `npx wrangler deployments list -c
wrangler.jsonc` e `npx wrangler versions deploy <id-anterior>@100% -y -c wrangler.jsonc`. O banco não volta junto.

**Pagamento sem plano:** Admin → Cobrança → "Reprocessar" (idempotente); se não resolver, estornar no Asaas e excluir a
assinatura lá (runbook §0.1-bis).

## 6. O que NÃO fazer

- Nunca colar, imprimir ou fotografar segredo, token, chave, número de cartão ou CPF no chat, em issue, em PR ou em log.
  `wrangler secret put` lê o valor do prompt; `wrangler secret list` mostra só nomes.
- Nunca usar dado, e-mail ou conta de **menor** (a prova do convite ao responsável é outra, com roteiro próprio).
- Nunca usar cartão, CPF ou e-mail de terceiro, nem o cartão de teste do sandbox em produção.
- Nunca abrir `ANUAL_ENABLED` nem ligar `anuncios`, `stt_ao_vivo`, `voz_natural` ou `venda_planos_v4` na prova.
- Nunca criar plano, preço ou valor novo para a prova (o plano é identificado pelo valor pago).
- Nunca deixar uma porta aberta sem alguém olhando: abriu, anotou a hora, fechou no passo seguinte.
- Nunca rodar a conferência em laço, nem chamar rota autenticada por script (soma no limitador por IP).
- Nunca editar o banco de produção à mão; a CLI (`operacao.cjs`) e o Admin existem para isso.

## 7. Modelo de relatório (o dono assina)

```markdown
# Prova real em produção — AAAA-MM-DD

- Versão provada: `0.1.0+<sha>` (`/api/health`)
- Quem: <dono> (execução), assistente (conferência e logs)
- Conferência inicial: <N ok / N aviso / 0 falha>, hora UTC <hh:mm>

| porta                     | aberta (UTC) | fechada (UTC) | minutos |
| ------------------------- | ------------ | ------------- | ------- |
| SIGNUP_ENABLED + Supabase |              |               |         |
| CHECKOUT_ENABLED          |              |               |         |

| passo                    | resultado (ok / falhou / pulado) | evidência (requestId, id do evento no Asaas, print sem dado pessoal) |
| ------------------------ | -------------------------------- | -------------------------------------------------------------------- |
| alerta por e-mail        |                                  |                                                                      |
| cadastro e confirmação   |                                  |                                                                      |
| 2FA                      |                                  |                                                                      |
| login Google             |                                  |                                                                      |
| pagamento (valor, plano) |                                  |                                                                      |
| concessão pelo webhook   |                                  |                                                                      |
| estorno e volta a free   |                                  |                                                                      |
| reconciliação (D+1)      |                                  |                                                                      |
| exclusão da conta        |                                  |                                                                      |
| conferência final        |                                  |                                                                      |

- Conferências do §10 marcadas nesta prova: <números>
- Incidentes ou desvios: <nenhum | descrição>
- Pendências que seguem: <lista>

Assinado: **\*\*\*\***\_\_\_\_**\*\*\*\*** (dono), em AAAA-MM-DD
```
