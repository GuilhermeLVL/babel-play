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

#### Scenario: Intencao pro, pagamento essencial
- **WHEN** `subscriptions.plan` e `pro` e o pagamento confirmado tem o valor do `essencial`
- **THEN** o usuario recebe `essencial`, o evento fica `aplicado` com `motivo` de divergencia

### Requirement: Evento nao aplicado pode ser reprocessado
O servidor SHALL expor a um administrador a lista de eventos `nao-aplicado` e uma acao de reprocessar que aplica o payload salvo com a logica atual, sem duplicar efeitos.

#### Scenario: Reprocessar depois de corrigir o catalogo
- **WHEN** um administrador chama reprocessar para um evento `nao-aplicado` cujo valor agora casa com um plano
- **THEN** o plano e concedido, o estado muda para `aplicado`, e uma segunda chamada nao concede de novo

