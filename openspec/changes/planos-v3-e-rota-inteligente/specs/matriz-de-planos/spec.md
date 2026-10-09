## MODIFIED Requirements

### Requirement: Um plano pago só

A matriz SHALL ter os planos `free`, `essencial`, `premium`, `aovivo` e `selfhost`. Preços: Essencial
R$ 9,90 por mês ou R$ 79,90 por ano; Premium R$ 19,90 ou R$ 149,90; Ao Vivo R$ 39,90, só mensal. Todo
valor cobrável (mensal, anual, parcela) SHALL ser distinto dos demais, porque o webhook identifica o
plano pelo valor pago.

#### Scenario: A matriz vendável

- **WHEN** alguém lista os planos vendáveis com a flag `venda_planos_v3` ligada
- **THEN** aparecem Essencial, Premium e Ao Vivo com esses preços

#### Scenario: Venda fechada

- **WHEN** a flag `venda_planos_v3` está desligada
- **THEN** `/api/billing/assinar` recusa os planos novos

#### Scenario: Pagar o barato com a intenção do caro

- **WHEN** a intenção gravada é Premium e o pagamento confirmado é de R$ 9,90
- **THEN** o plano concedido é o Essencial

## ADDED Requirements

### Requirement: Capacidades por plano

Cada plano SHALL declarar na matriz: `semAnuncios`, nuvem por trechos, `sttAoVivo`, Nuance, intérprete
automático e nível de voz. O código SHALL decidir por essas capacidades; comparar o nome do plano fica
restrito à matriz e à cobrança.

#### Scenario: Plano pago novo na admissão

- **WHEN** uma conta do Essencial ou do Ao Vivo pede nuvem
- **THEN** entra na faixa de pagantes da admissão

#### Scenario: Cliente e servidor iguais

- **WHEN** a matriz ganha um campo
- **THEN** os entitlements do cliente o recebem sem cópia manual em outro arquivo

### Requirement: Cotas mensais por nível de serviço

A matriz SHALL declarar segundos mensais por trechos e ao vivo: Essencial 5 h por trechos; Premium
20 h por trechos; Ao Vivo 20 h por trechos e 10 h ao vivo. O uso SHALL ser contado em métricas
separadas, com reserva antes do provedor e estorno na falha.

#### Scenario: Reserva no nível certo

- **WHEN** um trecho de 30 s ao vivo é reservado e o provedor falha
- **THEN** os 30 s voltam ao contador ao vivo e o contador por trechos não muda

#### Scenario: A tela lê o restante

- **WHEN** a tela pede `/api/me/uso`
- **THEN** recebe o restante do mês por nível

### Requirement: Troca de plano

Quem já assina SHALL poder trocar de plano sem cancelar. A troca SHALL valer no próximo ciclo, sem
pro-rata.

#### Scenario: Subir de Essencial para Premium

- **WHEN** um assinante do Essencial pede o Premium
- **THEN** a assinatura passa ao valor novo no próximo vencimento e o plano muda quando o pagamento é
  confirmado

### Requirement: Nada prometido que o servidor recusa

A tela de Planos SHALL mostrar só capacidades que a matriz concede e que a rota correspondente atende,
com as horas vindas da matriz.

#### Scenario: Ao vivo ainda desligado

- **WHEN** a flag `stt_ao_vivo` está desligada
- **THEN** o plano Ao Vivo não é vendido
