## ADDED Requirements

### Requirement: O valor de todo credito e decidido pelo servidor
Para todo `creditoId`, o servidor (e o efemero, pela mesma funcao) SHALL decidir o valor em Seeds e XP a partir do catalogo, do passe ou do drop registrado, ignorando qualquer valor enviado pelo cliente.

#### Scenario: Bau do passe alcancado
- **WHEN** um usuario com nivel 10 envia `creditoId = passe:t1:cofre-d1-1`
- **THEN** o servidor credita o valor de `slotsDoPasse` para aquele bau, uma vez, e reenvios devolvem `jaExistia`

#### Scenario: Bau do passe nao alcancado
- **WHEN** um usuario de nivel 3 envia `creditoId = passe:t1:cofre-d5-1`
- **THEN** o servidor recusa com o nivel necessario e nada e creditado

#### Scenario: Cliente envia amount
- **WHEN** o corpo traz `amount: 9999`
- **THEN** o valor creditado e o do servidor; `amount` nao e lido

### Requirement: Drop e evento do servidor
Um drop de partida SHALL existir como registro do servidor antes de poder ser aberto, e SHALL ser aberto no maximo uma vez.

#### Scenario: Abrir duas vezes
- **WHEN** o cliente chama abrir para o mesmo drop duas vezes
- **THEN** a segunda chamada devolve o mesmo resultado sem novo item nem novo credito

### Requirement: Recordes incluem combo
`GET /api/exercises/recordes` SHALL devolver `melhorCombo`, `precisao` e `ultimaEm` por jogo, a partir de `exercise_results.combo`.

#### Scenario: Rodada com sequencia
- **WHEN** uma rodada e gravada com `melhorSequencia = 9`
- **THEN** o recorde do jogo reporta `melhorCombo >= 9` e a conquista `duelista` pode disparar

### Requirement: Gasto e atomico
Dois gastos concorrentes do mesmo usuario SHALL NOT ultrapassar o saldo.

#### Scenario: Saldo para um
- **WHEN** dois `POST /seeds/gastar` de 40 chegam ao mesmo tempo com saldo 50
- **THEN** exatamente um recebe 200 e o outro 402
