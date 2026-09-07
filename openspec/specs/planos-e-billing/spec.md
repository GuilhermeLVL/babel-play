# planos-e-billing Specification

## Purpose
Descreve planos, entitlements e cobranca como existem HOJE: uma matriz unica de planos compartilhada por cliente e servidor, a assinatura como fonte de verdade do plano, quotas reservadas na mesma instrucao que as decide e um webhook do Asaas idempotente e com estado. Escrita a partir do codigo em 2026-09-07 (auditoria, Fluxo 1 e achado A05); cada requirement cita o `arquivo:linha` que o implementa. Ver tambem as specs `matriz-de-planos`, `descobribilidade-de-planos` e `pagamento-nunca-perdido`.

## Requirements

### Requirement: Uma matriz de planos, importada dos dois lados
`PLAN_MATRIX` (`src/core/planos.ts:56`) SHALL ser a unica definicao dos planos; o servidor a importa em `server/lib/entitlements.ts` e `server/lib/usageQuota.ts`, o cliente em `src/lib/entitlements.ts` e nas telas de planos. `planoPeloPreco` (`planos.ts:105`) mapeia o valor cobrado de volta ao plano.

#### Scenario: Mudar um limite
- **WHEN** um limite de plano muda em `PLAN_MATRIX`
- **THEN** cliente e servidor passam a aplicar o novo valor sem outra edicao

### Requirement: O plano vem da assinatura, os entitlements do plano
`getPlanForUser` (`server/lib/entitlements.ts:39`) SHALL ler `subscriptions` e devolver o plano vigente; `hasEntitlement` (`entitlements.ts:87`) responde por capacidade; o cliente le `GET /api/me/entitlements` e guarda em `localStorage['babel.entitlements']` (`src/lib/entitlements.ts:101`).

#### Scenario: Assinatura cancelada
- **WHEN** a assinatura passa a `cancelada`
- **THEN** o plano volta ao gratuito na proxima leitura e as capacidades pagas fecham

### Requirement: Quota gerida e decidida e contabilizada na mesma instrucao
`reserveManagedCall` (`server/lib/usageQuota.ts:70`) SHALL reservar a chamada de IA gerida em uma unica escrita condicional sobre `usage_counters`, para o teto valer sob concorrencia.

#### Scenario: Duas chamadas no limite
- **WHEN** restam 1 chamada e duas chegam ao mesmo tempo
- **THEN** so uma e reservada; a outra recebe 402

### Requirement: O webhook do Asaas e idempotente, server-authoritative e com estado
O webhook SHALL ser montado antes do auth (`server.ts:150-151`), validar o token, marcar o evento em `billing_events` uma vez por id e aplicar via `aplicarEvento` (`server/lib/billingEventos.ts:62`), que decide pelo valor cobrado e pelo `externalReference`, nunca pelo corpo enviado pelo cliente. Todo evento fica com `estado` (`aplicado`, `nao-aplicado`, `ignorado`) e `motivo`; os pendentes aparecem em `GET /api/admin/billing/pendentes` e podem ser reaplicados por `POST /api/admin/billing/reprocessar/:id` (`server/routes/admin.ts`).

#### Scenario: Evento repetido
- **WHEN** o Asaas reenvia o mesmo `event.id`
- **THEN** a resposta e `repetido` e nada e reaplicado (`tests/integration/billing-webhook.test.ts`)

#### Scenario: Avulso que chega antes da compra
- **WHEN** um `PAYMENT_CONFIRMED` referencia um `providerPaymentId` que ainda nao existe em `credit_purchases`
- **THEN** o evento fica `nao-aplicado` com motivo, aparece na fila do admin e credita quando reprocessado apos a compra existir (`tests/integration/rbac-admin-endpoints.test.ts`)

### Requirement: A compra de creditos e iniciada pelo cliente e confirmada pelo provedor
`POST /api/billing/comprar` (`server/routes/billing.ts:71`) SHALL criar a compra `pendente` com o SKU do catalogo (`src/core/creditos.ts`) e devolver o link de pagamento; so o webhook a torna `paga`.

#### Scenario: Cliente tenta confirmar
- **WHEN** o cliente chama qualquer rota para marcar a compra como paga
- **THEN** nao existe tal rota; o estado so muda pelo webhook
