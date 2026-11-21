# Prova real do Plus em produção — roteiro para o dono

Objetivo: provar, com uma compra real do próprio dono em `https://frasy.com.br`, que o **Plus (R$ 14,90/mês, opção B)**
cobra no Asaas, ativa o plano pelo webhook, entrega as cotas da matriz e pode ser estornado — e, no fim, **voltar a venda
a fechar**. Este roteiro não abre nada sozinho: cada porta é aberta pelo dono, pelo tempo da prova, e fechada no passo
seguinte.

Estado de partida (opção B): venda **fechada**; só a flag `oferta_planos` está ligada (`venda_planos_v4`, `venda_familia`,
`venda_pro4` desligadas); **anual fechado**; Família e Pro "em breve". Fonte da verdade dos planos:
[`src/core/planos.ts`](../../src/core/planos.ts) e [`docs/specs/2026-10-24-planos-v4.md`](../specs/2026-10-24-planos-v4.md).
Se este texto divergir do código, o código vence. Referências de operação: [`LANCAMENTO.md` §8.8 e §11-bis](../LANCAMENTO.md),
[`flags.md`](../flags.md), [`deploy.md`](../deploy.md), [`runbook.md`](../runbook.md).

Produção é o ambiente raiz do `wrangler.jsonc`: todo comando `wrangler` leva `-c wrangler.jsonc` e **nunca** `--env staging`.
O que está como **A CONFIRMAR** o repositório não responde: o dono confere no painel antes do passo.

---

## 0. Como a venda do Plus se abre (o que o código exige)

Para `POST /api/billing/assinar` aceitar `plano: "plus"` (`server/routes/billing.ts`), as **três** portas abaixo têm de estar
abertas para a conta que compra:

| Porta                  | Onde é lida                                                                                                                            | Estado de partida                           | Como abrir (só pelo tempo da prova)                                                                      |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `CHECKOUT_ENABLED`     | `checkoutLigado()` em `server/lib/config.ts`; recusa com 503 `checkout_desligado` (`server/routes/billing.ts`)                         | `0` (secret; ausente = ABERTA, por desenho) | `npx wrangler secret put CHECKOUT_ENABLED -c wrangler.jsonc` e digitar `1`. Vale na próxima requisição.  |
| flag `venda_planos_v4` | `planosAVenda()` em `src/core/planos.ts`: o Plus só está à venda com ela ligada; sem ela, `/assinar` responde 503 `plano_indisponivel` | desligada                                   | **Só para o id do dono** (recomendado, ver abaixo), ou global com `flags ligar`.                         |
| `ANUAL_ENABLED`        | `anualLigado()`: só `1` abre o anual                                                                                                   | ausente = fechado                           | **Não abrir.** A prova é só do mensal. O anual do Plus (R$ 149,00) responderia 503 `anual_indisponivel`. |

**Flag só para o dono (evita expor o Plus ao público).** A flag aceita `regras.ids` (`server/lib/flags.ts`; formato em
[`flags.md`](../flags.md)). Com ids e `percentual: 0`, só essa conta vê o Plus à venda:

```bash
node dist-server/operacao.cjs flags definir venda_planos_v4 '{"habilitada":true,"regras":{"ids":["<id-da-conta-de-teste>"],"percentual":0}}'
node dist-server/operacao.cjs flags listar      # confere
```

A CLI sai de `npm run build` e roda da máquina do dono com a `DATABASE_URL` de produção no ambiente (nunca no chat). O
mesmo interruptor existe em **Admin → Flags** (`src/components/views/admin/PainelFlags.tsx`), mas ali só se vira o
`habilitada` (global); a regra por id é pela CLI ou por `PUT /api/admin/flags/venda_planos_v4`. O cache de flags dura 30 s.
**A CONFIRMAR:** que `definir` preserva a descrição da flag (`flags listar` depois).

Efeitos colaterais de ligar `venda_planos_v4` (para a conta coberta pela regra): o Essencial, o Premium e o Ao Vivo saem da
venda (`encerradoPor`), o teste de 3 dias passa a conceder o Plus (`planoDoTeste`) e as ofertas passam a sugerir o Plus.
Quem não está na regra segue vendo o estado de hoje.

A página pública `/planos` é **estática**, gerada no build: ela só mostra o Plus se o deploy teve `SITE_FLAGS_DE_VENDA`
com `venda_planos_v4` (`scripts/site/planosDoSite.ts`, `.github/workflows/deploy-worker.yml`), e **nunca** mostra o anual
sem `SITE_ANUAL_A_VENDA=1`. A prova não precisa dela: compra-se por **Planos dentro do app** (`/app`).

---

## 1. Pré-requisitos (marque todos antes de abrir qualquer porta)

| #   | Pré-requisito                                                                                                                                                                                                                                    | Como conferir                                                                                              | Quem       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | ---------- |
| P1  | A versão a provar está publicada: Actions → **deploy-worker** → `ambiente=production`. Precisa conter a matriz v4 (`plus` em `src/core/planos.ts`).                                                                                              | `/api/health` → `versao` termina no SHA esperado.                                                          | dono       |
| P2  | Secrets de produção (só **nomes**): `ASAAS_API_KEY` (chave de produção), `ASAAS_WEBHOOK_TOKEN`, `RESEND_API_KEY`, `EMAIL_REMETENTE`, `APP_URL`, `ALERTA_EMAIL_DESTINO` (lista em `server/lib/config.ts`).                                        | `npx wrangler secret list -c wrangler.jsonc`                                                               | dono       |
| P3  | `ASAAS_BASE_URL=https://api.asaas.com/v3` (já em `wrangler.jsonc`) e **sem** `ASAAS_SANDBOX`. Com a chave e base de sandbox, o boot aborta (`erroDeAsaasSandboxEmProducao`).                                                                     | `npx wrangler tail -c wrangler.jsonc` sem `ABORTADO` depois do deploy.                                     | assistente |
| P4  | Webhook do Asaas de produção: URL `https://frasy.com.br/api/billing/webhook/asaas`, eventos de cobrança e de assinatura, `authToken` = `ASAAS_WEBHOOK_TOKEN`, fila ligada e **não pausada**; juros e multa zerados.                              | Painel do Asaas → Integrações → Webhooks.                                                                  | dono       |
| P5  | Nenhuma assinatura manual antiga no Asaas com valor fora da matriz.                                                                                                                                                                              | Painel do Asaas → Assinaturas.                                                                             | dono       |
| P6  | Conta de teste **ADULTA** (e-mail do dono, ex. alias `+prova`; data de nascimento de adulto; CPF e cartão do próprio dono). Perfil protegido não compra. A conta já existe: o cadastro continua fechado (`SIGNUP_ENABLED=0`) e **não** é aberto. | Entrar em `https://frasy.com.br/app`; anotar o id da conta (`node dist-server/operacao.cjs conta listar`). | dono       |
| P7  | Um admin com 2FA para ver Admin → Cobrança e Admin → Flags (`node dist-server/operacao.cjs conta papel <e-mail> admin`).                                                                                                                         | Admin → Cobrança abre.                                                                                     | dono       |
| P8  | Resend verificado (SPF/DKIM/DMARC): o e-mail de **alerta** precisa funcionar para o passo 2. O recibo da compra **não** sai pelo Resend (ver §3).                                                                                                | Painel do Resend → Domains "Verified".                                                                     | dono       |
| P9  | Backup recente (menos de 8 dias).                                                                                                                                                                                                                | `gh run list --workflow backup-pg-dump.yml --limit 3`                                                      | assistente |

---

## 2. Passo a passo

**Regra:** uma conferência por momento (antes, durante, depois). Nada de laço: o IP do dono é o mesmo dos testes.

1. **Conferência inicial, somente leitura.**
   ```bash
   node scripts/producao/conferir-producao.mjs --url https://frasy.com.br --esperar-fechado
   ```
   _Esperado:_ 0 falhas; `/api/abertura` com `"checkout":false,"anual":false` (`server/lib/abertura.ts`). Sai com 1 se algo
   crítico falhar.
2. **Teste do alerta por e-mail** (sem ele, um webhook quebrado passaria em silêncio). Um único `curl` com token errado de
   propósito:
   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' -X POST https://frasy.com.br/api/billing/webhook/asaas -H 'asaas-access-token: prova-errado-de-proposito' -H 'content-type: application/json' -d '{}'
   ```
   _Esperado:_ `401`, log `billing_webhook_token_invalido` e, em até ~5 min, e-mail em `ALERTA_EMAIL_DESTINO`
   (`server/lib/alertaPorEmail.ts`). Não repita (um e-mail por evento por hora). Sem e-mail: **pare**.
3. **Abrir a flag do Plus só para a conta de teste** (§0) e anotar a hora. _Verificar (em até 30 s):_ na conta de teste,
   Planos mostra o Plus; `GET /api/billing/status` pela aba Rede do DevTools da conta logada traz `planosAVenda` com
   `plus` (o assistente não chama rota autenticada).
4. **Abrir a venda.** `CHECKOUT_ENABLED` → `1` (§0). Anotar a hora. _Verificar:_ `curl -s https://frasy.com.br/api/abertura`
   → `"checkout":true,"anual":false`. Atenção: `CHECKOUT_ENABLED` é global, e o Premium não tem flag de venda (`flagsDeVenda` vazio): para as contas fora da regra da flag, o Premium (R$ 19,90) volta a ser vendável enquanto a venda estiver aberta. Por isso a janela é curta e o cadastro segue fechado (só contas já existentes poderiam comprar). Faça os passos 5 a 8 sem pausa.
5. **Assinar.** Conta de teste: Planos → Plus → **mensal** (não aparece anual) → nome, CPF e e-mail para o recibo
   (`Checkout.tsx`) → abre a fatura do Asaas (`POST /api/billing/assinar` devolve `linkDePagamento`) → pagar com o cartão do
   dono. A cobrança é de **R$ 14,90**, descrição `Frasy Plus` (`server/routes/billing.ts`). _Esperado:_ a tela volta ao
   app com o plano ativo (`Assinado.tsx`).
6. **Conferir o webhook** (`npx wrangler tail -c wrangler.jsonc`, ou Workers Logs): `PAYMENT_CONFIRMED` (ou `PAYMENT_RECEIVED`)
   aplicado (`server/lib/billingEventos.ts`), sem `billing_evento_nao_aplicado`, `billing_valor_ambiguo` ou
   `billing_valor_fora_da_matriz`. O plano sai do **valor pago** (`planoPeloPagamento`): R$ 14,90 = Plus mensal.
7. **Conferir o resultado** (seção 3 abaixo).
8. **Fechar a venda** logo depois (seção 5): `CHECKOUT_ENABLED` → `0` e a flag `venda_planos_v4` desligada. Anotar a hora.
   A conta de teste **segue Plus** (fechar a venda não tira o plano).
9. **Estorno/cancelamento** (seção 4), depois da conferência.
10. **Conferência final:** `node scripts/producao/conferir-producao.mjs --url https://frasy.com.br --esperar-fechado` →
    0 falhas, tudo fechado.

---

## 3. O que conferir

| O quê                | Onde                                                                                                                                                                                                | Esperado                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cobrança no provedor | Painel do **Asaas** (o código só usa o Asaas: `server/lib/asaas.ts`) → Cobranças/Assinaturas                                                                                                        | Uma assinatura mensal de **R$ 14,90**, cliente com o CPF do dono, cobrança "Confirmada" (cartão); webhook com resposta 200 no histórico de entregas.                                                                                                                                                                                                                                                                                                                            |
| Plano ativo na conta | `GET /api/billing/status` (aba Rede; `server/routes/billing.ts`) e `GET /api/me/entitlements` (`server/routes/me.ts`)                                                                               | `assinatura.plano = "plus"`, `status = "active"`, `ciclo = "mensal"`, `renovacaoAutomatica = true`; `valeAte` = vencimento + 35 dias (`DIAS_DO_PERIODO_MENSAL`).                                                                                                                                                                                                                                                                                                                |
| Na tela              | Planos → **Sua assinatura** (`SuaAssinatura.tsx`)                                                                                                                                                   | Plus mensal, próxima cobrança, e a lista de faturas (`GET /api/billing/faturas`) com a de R$ 14,90 "paga".                                                                                                                                                                                                                                                                                                                                                                      |
| Cotas do Plus        | `GET /api/me/uso` (`server/routes/me.ts`) contra `PLAN_MATRIX.plus` em `src/core/planos.ts`                                                                                                         | Chamadas 16.250/mês; STT 28.800 s (8 h)/mês e 7.200 s/dia; tokens 2.000.000/mês e 200.000/dia; voz 150.000 caracteres/mês e 15.000/dia; explicações 300 e resumos 60/mês; escritas 30/mês; assistente 200/dia; parceiro de leitura 40/dia; armazenamento 500 MB. Entitlements: nuvem de STT e LLM, tradução nuance, voz natural nível `basica`, sem anúncios; **sem** intérprete automático e **sem** Ao Vivo. A janela da cota é a do período pago (`cota-pelo-periodo-pago`). |
| Recibo / e-mail      | O servidor **não envia e-mail de compra**: o Resend só serve ao convite do responsável e aos alertas (`server/lib/conviteDoResponsavel.ts`, `server/lib/alertaPorEmail.ts`). O recibo é o do Asaas. | Em Sua assinatura, o botão de recibo abre `transactionReceiptUrl` do Asaas (`linkDoAsaas`, só https em `*.asaas.com`). Conferir também a caixa de entrada do e-mail do checkout: **A CONFIRMAR** se o Asaas envia o aviso de cobrança (configuração de notificações do painel).                                                                                                                                                                                                 |
| Admin → Cobrança     | `GET /api/admin/billing/pendentes` (`server/routes/admin.ts`)                                                                                                                                       | Sem pendentes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

Se o plano não vier em 5 min, ou aparecer `billing_evento_nao_aplicado`, `billing_webhook_marca_presa`,
`billing_*_divergente` ou `billing_*_ambigua`: **pare, feche a venda** (seção 5), e use Admin → Cobrança → "Reprocessar"
(`POST /api/admin/billing/reprocessar/:id`, idempotente). Se não resolver, estorne no Asaas **e** exclua a assinatura lá
(senão o mês seguinte é cobrado) — `runbook.md` §0.1-bis.

---

## 4. Estorno e cancelamento

O caminho único é `POST /api/billing/cancelar` (`encerrarAssinatura`, `server/lib/encerramentoDeAssinatura.ts`), pelo botão
**Cancelar assinatura** (`Cancelar.tsx`) em Planos → Sua assinatura. Ele **não exige a venda aberta**.

- **Dentro de 7 dias do primeiro pagamento confirmado** (`DIAS_DE_ARREPENDIMENTO`): é arrependimento. Cancela a assinatura
  no Asaas, **estorna o valor integral (R$ 14,90)** e o acesso acaba na hora, com protocolo na tela. _Esperado:_ no Asaas a
  assinatura some e a cobrança fica "Estornada"; no tail, `PAYMENT_REFUNDED` aplicado; `GET /api/billing/status` volta a
  plano `free`. É este o caminho da prova.
- **Depois de 7 dias:** só para a renovação; o período pago vale até o próximo vencimento informado pelo Asaas. Sem
  reembolso proporcional.
- **Estorno automático falhou** (o Asaas recusa boleto e, logo após Pix, pode faltar saldo): o pedido fica como
  `nao-aplicado` na fila de Admin → Cobrança e a tela promete reembolso manual em até
  `PRAZO_DO_REEMBOLSO_MANUAL_DIAS` (7). Estorne no painel do Asaas e **exclua a assinatura** lá.
- **Taxa do Asaas sobre transação de cartão estornada:** **A CONFIRMAR** no contrato do Asaas.

Depois do estorno: no dia seguinte, o job `reconciliarCobrancas` (cron `29 3 * * *` UTC em `wrangler.jsonc`, modo `report`)
deve registrar `divergentes: 0` nos Workers Logs (`job_fim`), sem e-mail `billing_reconciliacao_divergente`.

**Limpeza (opcional):** Ajustes → Conta → "Excluir a conta" (`DELETE /api/me` com `{"confirmar":true}`) encerra a
assinatura pelo mesmo caminho; com estorno pendente responde 409 `estorno_pendente` e não apaga nada. A marca do teste de
3 dias (HMAC do e-mail) e o cliente no Asaas ficam por desenho.

---

## 5. Voltar a fechar a venda (1 minuto, sem deploy)

```bash
npx wrangler secret put CHECKOUT_ENABLED -c wrangler.jsonc        # digite 0
node dist-server/operacao.cjs flags desligar venda_planos_v4      # ou apagar regras.ids; a opção B é a flag desligada
node dist-server/operacao.cjs flags listar                        # confere
curl -s https://frasy.com.br/api/abertura                         # {"cadastro":false,"checkout":false,"anual":false}
node scripts/producao/conferir-producao.mjs --url https://frasy.com.br --esperar-fechado
```

`SIGNUP_ENABLED` e `ANUAL_ENABLED` não foram tocados (continuam `0` e ausente). Estado final esperado: `oferta_planos` ligada,
`venda_planos_v4`/`venda_familia`/`venda_pro4` desligadas, venda fechada. Quem já assina (a conta de teste, se não estornada)
mantém o plano: a venda fecha, o direito não.

**Pare e feche na hora** se: a conferência do passo 1 falhar em algo crítico; o e-mail de alerta do passo 2 não chegar; o
pagamento confirmar e o plano não vier em 5 min; houver 5xx em rota de cobrança, `ABORTADO` no tail ou cobrança em valor
diferente de R$ 14,90.

**Deploy ruim** (se P1 publicou uma versão que quebrou): `runbook.md` §0.3, `npx wrangler deployments list -c wrangler.jsonc`
e `npx wrangler versions deploy <id-anterior>@100% -y -c wrangler.jsonc`. O banco não volta junto.

---

## 6. O que NÃO fazer

- Nunca colar, imprimir ou fotografar segredo, token, chave, cartão ou CPF no chat, em issue, PR ou log.
- Nunca usar conta, dado ou cartão de **menor** ou de terceiro, nem o cartão de teste do sandbox em produção.
- Nunca abrir `ANUAL_ENABLED`, `SIGNUP_ENABLED` nem ligar `venda_familia`, `venda_pro4`, `anuncios`, `stt_ao_vivo` ou
  `voz_natural` na prova.
- Nunca criar plano, preço ou valor novo para a prova: o plano é identificado pelo valor pago e todo valor cobrável é
  único (`tests/planos-matriz.test.ts`). Uma cobrança manual de outro valor no painel do Asaas chega ao webhook sem compra
  registrada e termina `nao-aplicado`.
- Nunca deixar uma porta aberta sem alguém olhando: abriu, anotou a hora, fechou no passo seguinte.
- Nunca editar o banco de produção à mão: a CLI (`operacao.cjs`) e o Admin existem para isso.

---

## 7. Modelo de relatório (o dono assina)

```markdown
# Prova real do Plus — AAAA-MM-DD

- Versão provada: `0.1.0+<sha>` (`/api/health`)
- Conferência inicial: <N ok / N aviso / 0 falha>, hora UTC <hh:mm>

| porta                            | aberta (UTC) | fechada (UTC) | minutos |
| -------------------------------- | ------------ | ------------- | ------- |
| flag `venda_planos_v4` (só o id) |              |               |         |
| `CHECKOUT_ENABLED`               |              |               |         |

| passo                                  | resultado (ok / falhou / pulado) | evidência (requestId, id do evento no Asaas, print sem dado pessoal) |
| -------------------------------------- | -------------------------------- | -------------------------------------------------------------------- |
| alerta por e-mail                      |                                  |                                                                      |
| cobrança de R$ 14,90 no Asaas          |                                  |                                                                      |
| plano `plus` ativo (`/billing/status`) |                                  |                                                                      |
| cotas (`/me/uso`) = matriz             |                                  |                                                                      |
| recibo (Sua assinatura / Asaas)        |                                  |                                                                      |
| estorno e volta a `free`               |                                  |                                                                      |
| conferência final (tudo fechado)       |                                  |                                                                      |

Decisão: <venda do Plus pode abrir / ajustes antes de abrir>. Assinatura do dono: **\_\_**
```
