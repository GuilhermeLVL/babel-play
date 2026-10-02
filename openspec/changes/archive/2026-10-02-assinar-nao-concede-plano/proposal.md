## Why

A auditoria pré-deploy de 2026-09-13 **provou por PoC** (`openspec/audits/2026-09-13-pre-deploy/evidencias/poc-billing.txt`)
que `POST /api/billing/assinar` concede o plano pago **antes de qualquer pagamento**.

A change `servidor-e-autoridade` (30/31, tarefas 4.1–4.2 marcadas feitas) endureceu o **webhook**:
ele agora confere `payment.subscription` contra `providerSubscriptionId` e `payment.value` contra
`PLAN_MATRIX[plano].precoMensalBrl`. Isso fechou a forja de webhook — **mas não o caminho
`/assinar`**, que é outro. A auditoria encontrou a porta que sobrou.

O fluxo real (`server/routes/billing.ts:200-206`): ao assinar, o servidor grava
`subscriptions {plan: <o que o cliente pediu>, status: atual?.status ?? 'trialing'}`. Para um usuário
novo, `atual` é `undefined`, então `status = 'trialing'`. E `server/lib/entitlements.ts:31-33`
(`subConcede`) trata `'trialing'` como **concessão do plano**. Resultado, provado:

```
1) Usuário novo, sem pagar:            getPlanForUser => "free"
2) Chamou /assinar (grava trialing+pro), MAS NUNCA pagou nem houve webhook.
3) Plano efetivo resolvido no servidor: getPlanForUser => "pro"
```

O comentário em `billing.ts:198-199` afirma que a rota "NÃO muda plan/status" — o que é verdade para
`status`, mas **falso para `plan`**, e como `trialing` já concede, o efeito é conceder o plano pedido.
Pré-condição: Asaas configurado e aceitando o CPF/CNPJ (em sandbox, trivial; em produção, basta
criar a assinatura e receber o link — sem pagar a fatura). Impacto: perda de receita; qualquer conta
autenticada vira Pro. CWE-840/CWE-639.

## What Changes

- `/assinar` **não grava `plan` nem `status` que concedam** o plano. A promoção passa a ser
  exclusiva do webhook, quando o pagamento confirma (o webhook já valida valor/assinatura).
- Se for necessário registrar a INTENÇÃO para o webhook saber o que conceder, ela vai numa coluna
  separada (ex.: `pending_plan`/`intended_plan`) que `entitlements`/`subConcede` **ignoram**; ou o
  webhook deriva o plano do `externalReference`/da assinatura Asaas, não de uma linha já concedida.
- `subConcede` deixa de conceder em `trialing` sem lastro de pagamento — ou o estado inicial de uma
  assinatura não paga deixa de ser `trialing` (que hoje é sinônimo de "válida").
- Regressão: `tests/integration/billing-webhook.test.ts` (ou um novo `billing-assinar.test.ts`)
  ganha o caso "após `/assinar`, `getPlanForUser` continua `free` até o webhook de pagamento".

## Non-Goals

- Não altera o caminho de webhook já endurecido por `servidor-e-autoridade` (4.1–4.4).
- Não muda o catálogo de planos nem os preços (`src/core/planos.ts`).
- Não trata o webhook HMAC/re-fetch (GAP-011, P1) — é change separada.
