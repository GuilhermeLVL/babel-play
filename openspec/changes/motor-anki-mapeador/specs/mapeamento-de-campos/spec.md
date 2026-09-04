## ADDED Requirements

### Requirement: O usuário vê o que o app entendeu e pode discordar
O sistema SHALL mostrar, antes de gravar, quais campos do baralho viraram palavra, significado e
frase, e SHALL permitir trocar qualquer um deles.

#### Scenario: Palpite certo
- **WHEN** o app acerta o mapeamento
- **THEN** o usuário vê a amostra correta e segue sem precisar mexer em nada

#### Scenario: Palpite errado
- **WHEN** o app escolhe o campo errado como palavra
- **THEN** o usuário troca o campo e a amostra é recalculada na hora, antes de gravar qualquer coisa

#### Scenario: Campo sem papel
- **WHEN** o baralho tem campos que não correspondem a nenhum papel
- **THEN** eles aparecem listados como não usados, com seu conteúdo, e não somem da tela

### Requirement: Palpite fraco não importa em silêncio
O sistema SHALL classificar a confiança de cada palpite e SHALL pedir confirmação antes de gravar
quando a confiança da palavra ou do significado for baixa.

#### Scenario: Nomes reconhecidos
- **WHEN** os campos se chamam `Word` e `Meaning`
- **THEN** a confiança é alta e a importação segue sem interrupção

#### Scenario: Campos sem nome reconhecível
- **WHEN** os dois primeiros campos são `№` e `IMG` e nenhum nome é reconhecido
- **THEN** o app não importa às cegas: pede a confirmação do mapeamento antes de gravar

#### Scenario: Nome ambíguo
- **WHEN** um campo se chama `Expression` e pode ser palavra ou frase
- **THEN** o app decide pela amostra do conteúdo, marca a confiança como baixa e destaca esse campo para conferência

### Requirement: Corrigir uma vez vale para os próximos baralhos iguais
O sistema SHALL guardar o mapeamento confirmado por estrutura do tipo de nota e SHALL reaplicá-lo
quando reconhecer a mesma estrutura.

#### Scenario: Segundo baralho do mesmo tipo
- **WHEN** o usuário importa outro baralho com a mesma estrutura de campos já corrigida antes
- **THEN** o mapeamento salvo é aplicado sozinho, e a tela diz que foi aplicado e permite desfazer

#### Scenario: Estrutura diferente
- **WHEN** os campos têm os mesmos nomes em ordem diferente
- **THEN** o perfil salvo NÃO é aplicado, e o mapeamento automático decide de novo

#### Scenario: Tipos de nota conhecidos da comunidade
- **WHEN** o baralho usa um tipo de nota popular já catalogado
- **THEN** o mapeamento inicial já vem correto, sem o usuário ter configurado nada

### Requirement: Trocar o mapeamento não exige o arquivo de novo
O sistema SHALL recalcular palavra, significado e frase a partir dos campos guardados quando o
mapeamento de um baralho já importado mudar.

#### Scenario: Correção depois da importação
- **WHEN** o usuário corrige o mapeamento de um baralho já importado
- **THEN** as notas daquele baralho são recalculadas sem pedir o arquivo, e o relatório diz quantas mudaram

#### Scenario: Nota que passa a ser jogável
- **WHEN** a correção faz uma nota antes descartada ganhar significado válido
- **THEN** ela deixa de estar descartada e fica disponível para ativação

### Requirement: Áudio é reconhecido pelo conteúdo, não só pelo nome do campo
O sistema SHALL detectar referências de mídia em qualquer campo, independentemente do nome dele.

#### Scenario: Áudio embutido em campo de texto
- **WHEN** a marcação de som aparece num campo chamado `Meaning`
- **THEN** o áudio é reconhecido como mídia daquela nota, e o texto do significado não fica poluído com a marcação

#### Scenario: Campo que contém "meaning" no nome mas é áudio
- **WHEN** o baralho tem os campos `Meaning` e `Sound_Meaning`
- **THEN** o significado vem de `Meaning`, e `Sound_Meaning` não é usado como texto
