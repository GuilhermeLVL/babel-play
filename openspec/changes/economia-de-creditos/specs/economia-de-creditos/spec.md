## ADDED Requirements

### Requirement: Moeda comprada vive no servidor
Créditos comprados com dinheiro SHALL existir apenas como eventos no servidor; o cliente
apenas exibe o saldo derivado.

#### Scenario: localStorage adulterado
- **WHEN** o usuário edita qualquer estado local de créditos ou posse premium
- **THEN** nada muda no que ele possui — o servidor é a única fonte

### Requirement: Crédito só entra confirmado
Créditos SHALL ser creditados apenas na confirmação do processador de pagamento, de forma
idempotente por evento.

#### Scenario: Webhook reentregue
- **WHEN** o mesmo evento de pagamento chega duas vezes
- **THEN** o crédito entra uma única vez
