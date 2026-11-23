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

#### Scenario: Assinatura cancelada com periodo pago a frente

- **WHEN** a assinatura passa a `canceled` e `currentPeriodEnd` ainda esta no futuro
- **THEN** o plano continua valendo ate `currentPeriodEnd` (Decreto 11.034/2022; `subConcede` em `server/lib/entitlements.ts`)

#### Scenario: Assinatura cancelada sem periodo pago

- **WHEN** a assinatura esta `canceled` e `currentPeriodEnd` e nulo ou ja passou (inclusive por estorno ou arrependimento, que zeram o periodo)
- **THEN** o plano volta ao gratuito na proxima leitura e as capacidades pagas fecham

### Requirement: Cancelar e arrepender-se pelo mesmo canal

`POST /api/billing/cancelar` SHALL delegar a `encerrarAssinatura` (`server/lib/encerramentoDeAssinatura.ts`), a mesma funcao usada por `DELETE /api/me`. Com o primeiro pagamento confirmado ha 7 dias ou menos (CDC art. 49), cancela no Asaas, estorna o valor integral (`POST /v3/payments/{id}/refund`), zera o periodo pago e devolve um protocolo; depois disso, cancela a renovacao e grava como fim do periodo o `nextDueDate` informado pelo Asaas. Estorno recusado pelo Asaas SHALL virar `nao-aplicado` em `billing_events` (fila do admin, reaplicavel), nunca sumir. Testes: `tests/integration/billing-cancelar-e-arrependimento.test.ts`.

#### Scenario: Arrependimento dentro de 7 dias

- **WHEN** o titular cancela e o primeiro pagamento confirmado tem ate 7 dias
- **THEN** a assinatura e cancelada, o pagamento e estornado por inteiro, o plano cai para gratuito na hora e a resposta traz `arrependimento.protocolo`

#### Scenario: Estorno recusado

- **WHEN** o Asaas responde erro ao estorno (ex.: saldo insuficiente, boleto)
- **THEN** o evento `arrependimento:<pagamento>` fica `nao-aplicado` com motivo e a resposta diz `estornado: false` com o prazo do reembolso manual

### Requirement: Quota gerida e decidida e contabilizada na mesma instrucao

`reserveManagedCall` (`server/lib/usageQuota.ts:70`) SHALL reservar a chamada de IA gerida em uma unica escrita condicional sobre `usage_counters`, para o teto valer sob concorrencia.

#### Scenario: Duas chamadas no limite

- **WHEN** restam 1 chamada e duas chegam ao mesmo tempo
- **THEN** so uma e reservada; a outra recebe 402

### Requirement: O webhook do Asaas e idempotente, server-authoritative e com estado

O webhook SHALL ser montado antes do auth (`server.ts:150-151`), validar o token, marcar o evento em `billing_events` uma vez por id e aplicar via `aplicarEvento` (`server/lib/billingEventos.ts`), que decide pelo valor cobrado e pelo `externalReference`, nunca pelo corpo enviado pelo cliente. Todo evento fica com `estado` (`aplicado`, `nao-aplicado`, `ignorado`) e `motivo`; os pendentes aparecem em `GET /api/admin/billing/pendentes` e podem ser reaplicados por `POST /api/admin/billing/reprocessar/:id` (`server/routes/admin.ts`). Um valor pago que não casa com a matriz MUST conceder no máximo o plano da cobrança registrada, e só se cobrir o preço dele; caso contrário o evento MUST ficar `nao-aplicado`. Um estorno ou chargeback MUST revogar só o período concedido pela cobrança devolvida. A reconciliação diária MUST olhar só as assinaturas relevantes, em rodízio determinístico com custo limitado por passada, e reaplicar também estornos e chargebacks sem evento.

#### Scenario: Evento repetido

- **WHEN** o Asaas reenvia o mesmo `event.id`
- **THEN** a resposta e `repetido` e nada e reaplicado (`tests/integration/billing-webhook.test.ts`)

#### Scenario: Avulso que chega antes da compra

- **WHEN** um `PAYMENT_CONFIRMED` referencia um `providerPaymentId` que ainda nao existe em `credit_purchases`
- **THEN** o evento fica `nao-aplicado` com motivo, aparece na fila do admin e credita quando reprocessado apos a compra existir (`tests/integration/rbac-admin-endpoints.test.ts`)

#### Scenario: Juros no boleto do plano assinado

- **WHEN** o pagamento do Plus chega com R$ 15,37 (preço + multa) numa linha que já foi do Premium
- **THEN** concede o Plus, nunca o Premium gravado de outra cobrança

#### Scenario: Estorno de uma cobrança antiga

- **WHEN** a mensalidade de outubro é estornada e a de novembro segue paga
- **THEN** o plano continua até o fim do período de novembro e o evento fica `ignorado` com o porquê

#### Scenario: Estorno com webhook perdido

- **WHEN** a cobrança está `REFUNDED` no Asaas e nenhum evento de estorno foi registrado
- **THEN** a reconciliação em `apply` reaplica o estorno pelo mesmo `aplicarEvento`, uma vez só

### Requirement: A compra de creditos e iniciada pelo cliente e confirmada pelo provedor

`POST /api/billing/comprar` (`server/routes/billing.ts:71`) SHALL criar a compra `pendente` com o SKU do catalogo (`src/core/creditos.ts`) e devolver o link de pagamento; so o webhook a torna `paga`.

#### Scenario: Cliente tenta confirmar

- **WHEN** o cliente chama qualquer rota para marcar a compra como paga
- **THEN** nao existe tal rota; o estado so muda pelo webhook

### Requirement: A cota de quem paga vale pelo período pago

Para quem tem um período pago em vigor (assinatura que concede um plano pago e tem `currentPeriodEnd`), o servidor SHALL
contar a cota do plano numa janela derivada do PERÍODO PAGO, e não do mês do calendário: no mensal, uma janela por
período; no anual (à vista ou 12x), 12 janelas iguais ao longo do período. Um pagamento MUST liberar no máximo uma cota
mensal (doze no anual). Grátis, convidado, self-host, teste de 14 dias e plano sem período MUST seguir no mês do
calendário. A reserva MUST continuar decidida e contabilizada numa única escrita condicional e falhar fechada.

#### Scenario: Um pagamento mensal que atravessa duas viradas de mês

- **WHEN** o Plus é pago com vencimento em 29/11 (acesso até 03/01) e a pessoa esgota a cota em 30/11
- **THEN** em 15/12 e em 02/01 a reserva é recusada, porque a janela é a mesma do período pago

#### Scenario: Cancelar não zera a cota

- **WHEN** a pessoa esgota a cota e cancela fora dos 7 dias (o fim do período passa a ser o próximo vencimento), ou o
  admin muda o fim do período
- **THEN** a janela não muda e a reserva segue recusada, porque a âncora da janela só é gravada por um pagamento

#### Scenario: A renovação paga abre a janela seguinte

- **WHEN** o pagamento seguinte confirma e estica o fim do período
- **THEN** a janela muda e a cota mensal recomeça

#### Scenario: O anual tem doze cotas

- **WHEN** a pessoa paga o anual
- **THEN** ao longo dos 370 dias existem exatamente 12 janelas de cota

#### Scenario: Grátis e plano do admin

- **WHEN** a conta é Grátis, ou tem plano concedido pelo admin sem período
- **THEN** a janela é o mês do calendário, como antes
