# pagamento-nunca-perdido Specification

## Purpose
TBD - created by archiving change webhook-asaas-sem-pagamento-perdido. Update Purpose after archive.
## Requirements
### Requirement: Todo evento de cobranca tem estado e motivo
Cada evento recebido pelo webhook SHALL ser persistido com `estado` (`aplicado` ou `nao-aplicado`), `motivo` quando nao aplicado, e o payload bruto.

#### Scenario: Valor pago nao casa com plano nem compra
- **WHEN** chega `PAYMENT_CONFIRMED` cujo valor nao corresponde a nenhum plano da matriz nem a nenhuma `credit_purchases` pendente
- **THEN** o evento fica `nao-aplicado` com motivo, a resposta e 200, e o diario registra `error` com o id do evento

### Requirement: Assinatura divergente nao perde o pagamento
Quando a intencao gravada em `subscriptions` diverge do valor pago, o servidor SHALL conceder o plano cujo preco casa com o valor pago e registrar a divergencia.

#### Scenario: Intencao mensal, pagamento anual
- **WHEN** a intencao gravada em `subscriptions` e Premium `mensal` e o pagamento confirmado tem o valor do anual (R$ 179)
- **THEN** o usuario recebe Premium com ciclo `anual` (vale o pago), e o evento fica `aplicado` com `motivo` `plano-divergente`

#### Scenario: Intencao com nome antigo
- **WHEN** `subscriptions.plan` ainda diz `pro` ou `essencial` e chega um pagamento de R$ 19,90 ou de R$ 39,90
- **THEN** o usuario recebe `premium` mensal; o nome antigo e lido como `premium` e, sozinho, nao conta como divergencia

### Requirement: Evento nao aplicado pode ser reprocessado
O servidor SHALL expor a um administrador a lista de eventos `nao-aplicado` e uma acao de reprocessar que aplica o payload salvo com a logica atual, sem duplicar efeitos.

#### Scenario: Reprocessar depois de corrigir o catalogo
- **WHEN** um administrador chama reprocessar para um evento `nao-aplicado` cujo valor agora casa com um plano
- **THEN** o plano e concedido, o estado muda para `aplicado`, e uma segunda chamada nao concede de novo

### Requirement: Iniciar assinatura nao concede o plano
`POST /api/billing/assinar` SHALL apenas iniciar a cobranca (criar a assinatura ou o parcelamento no provedor e devolver o link de pagamento). Ele SHALL NOT gravar nenhum estado que faca o servidor conceder o plano pago. A concessao do plano SHALL ocorrer exclusivamente quando o pagamento for confirmado (pelo webhook ja validado contra valor e assinatura).

#### Scenario: Assinar sem pagar nao vira Premium
- **WHEN** um usuario sem assinatura chama `POST /api/billing/assinar` e nenhum pagamento e confirmado
- **THEN** `getPlanForUser` continua devolvendo `free`
- **AND** nenhuma linha de `subscriptions` faz `subConcede` retornar verdadeiro

#### Scenario: Recomecar o checkout nao promove nem revoga
- **WHEN** `/assinar` e chamado para uma conta que ja tem linha em `subscriptions` (cancelada, ou tentativa anterior nao paga)
- **THEN** so os ids da nova tentativa de cobranca sao gravados; `plan`, `status` e `ciclo` nao mudam ate o webhook confirmar o pagamento

#### Scenario: Pagamento confirmado concede
- **WHEN** o webhook de pagamento confirmado chega, valido (valor e assinatura conferem)
- **THEN** o plano passa a ser o pago

### Requirement: `trialing` nao concede sem lastro
Um status que faca o servidor conceder o plano SHALL corresponder a um direito real (pagamento confirmado ou plano concedido pela rota admin). Uma assinatura recem-iniciada e nao paga SHALL NOT ter um status que `subConcede` interprete como concessao.

#### Scenario: Estado inicial nao concede
- **WHEN** `/assinar` cria a intencao de assinatura antes do pagamento
- **THEN** o estado inicial (`trialing`) nao e interpretado como plano valido por `entitlements`
