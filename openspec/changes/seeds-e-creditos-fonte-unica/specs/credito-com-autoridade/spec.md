## ADDED Requirements

### Requirement: O valor de todo credito e decidido pelo servidor
Para todo `creditoId`, o servidor (e o efemero, pela mesma funcao `valorDoCredito`) SHALL decidir o valor em Seeds e XP a partir do catalogo de conquistas ou dos slots do passe, ignorando qualquer valor enviado pelo cliente. Um `creditoId` que nao resolve SHALL ser recusado com 400 e codigo `credito_desconhecido`.

#### Scenario: Bau do passe alcancado
- **WHEN** um usuario cujo nivel alcanca a decada envia `creditoId = passe:t1:cofre-d2-1`
- **THEN** o servidor credita o valor daquele slot em `slotsDoPasse`, uma vez, e reenvios devolvem `jaExistia`

#### Scenario: Bau do passe nao alcancado
- **WHEN** um usuario de nivel 2 envia `creditoId = passe:t1:cofre-d10-1`
- **THEN** o servidor recusa com codigo `nivel_insuficiente`, dizendo o nivel atual e o exigido, e nada e creditado

#### Scenario: Cliente envia amount
- **WHEN** o corpo traz `amount: 9999` e `xp: 9999`
- **THEN** o valor creditado e o da regra; `amount` e `xp` nao sao lidos

#### Scenario: Modo sem conta
- **WHEN** o mesmo pedido chega ao servidor efemero (IndexedDB)
- **THEN** a resposta e o valor creditado sao os mesmos do Express, porque a funcao de decisao e a mesma

### Requirement: O preco de todo gasto e decidido pelo servidor
O `reason` de um gasto de Seeds SHALL resolver em `autorizarGasto`, o `amount` SHALL ser o preco do catalogo e o saldo SHALL pagar — no Express e no servidor efemero.

#### Scenario: Motivo inexistente no modo sem conta
- **WHEN** um gasto com `reason = 'dica'` chega ao servidor efemero
- **THEN** ele e recusado com 400, como no Express

#### Scenario: Preco divergente
- **WHEN** um gasto de `pular-rodada` chega com `amount: 1`
- **THEN** as duas pontas recusam com 400 e devolvem o preco do catalogo em `detalhes.preco`

### Requirement: Gasto e atomico
Gastos concorrentes do mesmo usuario SHALL NOT ultrapassar as Seeds ganhas. A conferencia de teto SHALL acontecer dentro da instrucao de escrita, nao apenas antes dela.

#### Scenario: Dez gastos simultaneos com saldo para dois
- **WHEN** dez `POST /seeds/gastar` de 40 chegam juntos com 100 Seeds ganhas
- **THEN** exatamente dois entram no ledger, os outros recebem 402, e o total gasto nunca passa do ganho

#### Scenario: Reenvio de compra ja paga
- **WHEN** a mesma compra e reenviada depois de o saldo ter acabado
- **THEN** a resposta e 200 com `jaExistia: true`, sem nova cobranca e sem pedir saldo

### Requirement: Recordes incluem combo
`GET /api/exercises/recordes` SHALL devolver `melhorCombo`, `precisao` e `ultimaEm` por jogo, a partir de `exercise_results.combo`, e o tipo `RecordeDoJogo` SHALL ser unico para cliente e servidor.

#### Scenario: Rodada com sequencia
- **WHEN** uma rodada e gravada com `melhorSequencia = 17`
- **THEN** o recorde do jogo reporta `melhorCombo = 17`

#### Scenario: Rodada anterior a coluna
- **WHEN** uma rodada sem combo e gravada depois de outra com combo 12
- **THEN** o recorde continua 12 — ausencia de combo nao e combo zero

### Requirement: O perfil emite o que as conquistas leem
`computeProfile` SHALL emitir `capturaMinutos` (total, sem teto) e `idiomas` (idiomas distintos das sessoes), alem de `capturaMinutosPremiados`.

#### Scenario: Ouvinte com teto diario
- **WHEN** o usuario grava 70 minutos num unico dia
- **THEN** `capturaMinutos` e 70, `capturaMinutosPremiados` e 30, e a conquista `ouvinte` (60 minutos gravados) e aceita

#### Scenario: Poliglota
- **WHEN** o usuario tem sessoes em dois idiomas distintos
- **THEN** `idiomas` e 2 e a conquista `poliglota` e aceita; com um idioma so, e recusada
