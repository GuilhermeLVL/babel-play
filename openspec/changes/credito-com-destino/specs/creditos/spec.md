## ADDED Requirements

### Requirement: Crédito comprado tem onde ser gasto
O saldo de Créditos SHALL poder ser debitado por uma rota, com a mesma régua de autorização das
Seeds: motivo em formato conhecido, preço do catálogo, saldo conferido.

#### Scenario: Compra de item premium com saldo
- **WHEN** o usuário tem saldo e pede um item cujo preço em Créditos existe no catálogo
- **THEN** o servidor debita o preço DO CATÁLOGO e concede a posse

#### Scenario: Sem saldo
- **WHEN** o saldo é menor que o preço
- **THEN** o servidor responde 402 dizendo quanto falta, e nada é gravado

#### Scenario: Motivo desconhecido
- **WHEN** o `reason` não cita um item premium existente
- **THEN** o servidor responde 400

#### Scenario: Reenvio do mesmo gasto
- **WHEN** o mesmo `spendId` chega duas vezes
- **THEN** o segundo devolve `jaExistia: true` e não cobra de novo

### Requirement: A origem "Créditos" deixa de ser rótulo vazio
Um item comprado com Créditos SHALL ser identificado como tal em toda tela que mostre origem.

#### Scenario: Item pago na prévia do inventário
- **WHEN** o usuário abre um item que comprou com Créditos
- **THEN** a etiqueta de origem diz "Créditos", e não "Seeds" nem "Nível"

#### Scenario: A Loja mostra a prateleira paga
- **WHEN** existem itens com preço em Créditos
- **THEN** a Loja mostra a prateleira deles, separada da que se compra com Seeds

### Requirement: O Passe Premium entrega o que a tela promete
Quem tem o Passe SHALL receber os Créditos das casas alcançadas, uma vez cada.

#### Scenario: Casa premium alcançada com o passe
- **WHEN** o usuário tem o passe e o nível dele alcança uma casa de Créditos
- **THEN** os Créditos daquela casa entram no saldo, idempotentes por casa

#### Scenario: Casa premium alcançada sem o passe
- **WHEN** o usuário alcança a mesma casa sem o passe
- **THEN** nada é creditado, e a casa continua mostrando o que viria

#### Scenario: A variante dourada do marco é um item de verdade
- **WHEN** o usuário com passe alcança um marco de dezena
- **THEN** a variante dourada daquela dezena existe no catálogo e pode ser equipada

### Requirement: Entitlement de plano é conferido no servidor
Todo recurso vendido por plano SHALL ser conferido no servidor, não só no cliente.

#### Scenario: Importar do YouTube sem o plano
- **WHEN** uma conta sem `youtubeImport` chama a rota de importação do YouTube direto
- **THEN** o servidor responde 402, como já faz para a nuvem gerenciada
