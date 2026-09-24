## ADDED Requirements

### Requirement: Iniciar assinatura não concede o plano
`POST /api/billing/assinar` SHALL apenas iniciar a cobrança (criar a assinatura no provedor e
devolver o link de pagamento). Ele SHALL NOT gravar nenhum estado que faça o servidor conceder o
plano pago. A concessão do plano SHALL ocorrer exclusivamente quando o pagamento for confirmado
(pelo webhook já validado contra valor e assinatura).

#### Scenario: Assinar sem pagar não vira Pro
- **WHEN** um usuário sem assinatura chama `POST /api/billing/assinar` com `plano: 'pro'` e nenhum
  pagamento é confirmado
- **THEN** `getPlanForUser` continua devolvendo `free`
- **AND** nenhuma linha de `subscriptions` faz `subConcede` retornar verdadeiro

#### Scenario: Troca de plano não promove antes de pagar
- **WHEN** um assinante `essencial` ativo chama `/assinar` pedindo `pro`
- **THEN** o plano efetivo continua `essencial` até o webhook confirmar o pagamento do `pro`

#### Scenario: Pagamento confirmado concede
- **WHEN** o webhook de pagamento confirmado chega, válido (valor e assinatura conferem)
- **THEN** o plano passa a ser o pago

### Requirement: `trialing` não concede sem lastro
Um status que faça o servidor conceder o plano SHALL corresponder a um direito real (pagamento
confirmado ou trial explicitamente concedido pela rota admin). Uma assinatura recém-iniciada e não
paga SHALL NOT ter um status que `subConcede` interprete como concessão.

#### Scenario: Estado inicial não concede
- **WHEN** `/assinar` cria a intenção de assinatura antes do pagamento
- **THEN** o estado inicial não é interpretado como plano válido por `entitlements`
