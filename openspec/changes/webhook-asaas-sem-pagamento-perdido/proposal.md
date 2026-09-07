## Why

`server/routes/billing.ts:364-390`: quando o webhook do Asaas confirma um pagamento cuja assinatura diverge do que esta em `subscriptions` (`billing_assinatura_divergente`, `:385-390`) ou cujo avulso nao casa com nenhuma compra (`billing_avulso_desconhecido`, `:371`), o handler loga e responde **200**. O Asaas trata 200 como entregue e nao reenvia; o evento ja foi marcado em `billing_events` (`:331`), entao uma reentrega manual tambem seria ignorada pela idempotencia. Resultado: cliente pagou e nao foi promovido, sem trilha para reprocessar. Achado A05 de `openspec/audits/2026-09-07-coerencia.md`.

## What Changes

- Todo evento recebido e persistido com `estado` (`aplicado` | `nao-aplicado`) e `motivo`, alem do `payload` bruto (coluna nova, migration aditiva).
- Evento nao aplicado responde 200 (para nao entrar em laco de reentrega) mas fica visivel: `GET /api/admin/billing/pendentes` lista, `POST /api/admin/billing/reprocessar/:id` reaplica com a logica atual, e o diario registra em nivel `error` com o id.
- Divergencia de assinatura deixa de ser `break`: se o valor pago casa com um plano da `PLAN_MATRIX` (`planoPeloValor`), o plano pago e concedido e a divergencia fica registrada; se nao casa, vira `nao-aplicado`.
- Teste de contrato do webhook cobre os dois caminhos e o reprocessamento.

## Capabilities

### New Capabilities
- `pagamento-nunca-perdido`: todo evento de cobranca tem estado, motivo e caminho de reprocessamento.

## Impact

- `server/routes/billing.ts` (ramos `:364-390`), `server/db/repositories/billingEvents.ts`, `server/db/schema.ts` (`billing_events.estado`, `motivo`, `payload`), migration `0022_*`
- `server/routes/admin.ts` (duas rotas, RBAC `admin`)
- `tests/integration/billing-webhook.test.ts` (+ cenarios), `tests/integration/rbac-admin-endpoints.test.ts`
- Remove: os dois `break` silenciosos

## Pronto quando

`billing-webhook.test.ts` prova: (1) assinatura divergente com valor de plano conhecido promove ao plano pago e registra `motivo`; (2) valor desconhecido persiste `nao-aplicado` e aparece em `GET /api/admin/billing/pendentes`; (3) `POST .../reprocessar/:id` aplica e muda o estado; (4) reentrega do mesmo id continua 200 sem efeito duplo. `npm test` verde.

## Dependencias e paralelismo

Depende de `linha-de-base-verde`. Paralelizavel com todas (so billing/admin). A migration `0022` deve ser numerada em coordenacao com `seeds-e-creditos-fonte-unica` (que tambem adiciona coluna) — uma unica migration por change, numeradas na ordem de merge.
