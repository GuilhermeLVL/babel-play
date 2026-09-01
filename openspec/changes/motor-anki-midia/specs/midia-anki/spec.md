## ADDED Requirements

### Requirement: A mídia do baralho sobrevive à importação
O sistema SHALL preservar, para cada nota, quais arquivos de áudio e imagem ela referencia, mesmo
quando os arquivos ainda não foram enviados.

#### Scenario: Nota com áudio nativo
- **WHEN** uma nota referencia um arquivo de som
- **THEN** a referência fica registrada na nota, e o texto do campo não mostra a marcação crua

#### Scenario: Nota com imagem
- **WHEN** uma nota referencia uma imagem
- **THEN** a referência fica registrada, com o nome original do arquivo, para poder ser resolvida depois

### Requirement: Só a mídia que vai ser usada trafega
O sistema SHALL enviar ao servidor apenas os arquivos de mídia das notas ativadas, e SHALL evitar
reenviar o que o servidor já tem.

#### Scenario: Baralho grande com muita mídia
- **WHEN** o usuário importa um baralho de centenas de megabytes e ativa um primeiro lote
- **THEN** só a mídia daquele lote é enviada, e o restante do arquivo não trafega

#### Scenario: Arquivo repetido
- **WHEN** o mesmo arquivo de mídia é referenciado por várias notas ou já foi enviado antes
- **THEN** ele é enviado uma única vez e reaproveitado

#### Scenario: Ativação sem o arquivo em mãos
- **WHEN** o usuário ativa notas numa sessão em que o arquivo original não está mais disponível
- **THEN** as notas são ativadas mesmo assim, e o app diz claramente que a mídia depende de reenviar o arquivo

### Requirement: O servidor é a autoridade sobre o que recebeu
O sistema SHALL verificar por conta própria a identidade e o tipo de cada arquivo recebido.

#### Scenario: Identidade do arquivo
- **WHEN** o cliente informa a identidade de um arquivo que envia
- **THEN** o servidor recalcula a identidade a partir do conteúdo e usa a sua própria

#### Scenario: Tipo incompatível
- **WHEN** o arquivo enviado não é áudio nem imagem reconhecível pelo seu conteúdo
- **THEN** ele é recusado, e a nota fica registrada como tendo mídia indisponível

### Requirement: A mídia importada conta na cota do plano
O sistema SHALL contabilizar o espaço ocupado pela mídia importada na mesma cota que já rege o áudio
de sessão.

#### Scenario: Envio dentro da cota
- **WHEN** há espaço no plano do usuário
- **THEN** a mídia é armazenada e o espaço usado passa a incluí-la

#### Scenario: Envio que estouraria a cota
- **WHEN** o envio ultrapassaria o limite do plano
- **THEN** ele é recusado com explicação de quanto falta, e nada é gravado pela metade

#### Scenario: Remoção do baralho
- **WHEN** um baralho é purgado e sua mídia não é referenciada por mais nada
- **THEN** os arquivos são removidos e o espaço volta para a cota do usuário

### Requirement: Mídia faltando é dita, e não vira cartão quebrado
O sistema SHALL informar por baralho quanta mídia é referenciada e quanta está de fato disponível, e
SHALL degradar para voz sintética em vez de apresentar um item mudo.

#### Scenario: Baralho compartilhado sem os áudios
- **WHEN** as notas referenciam áudios que não existem no pacote
- **THEN** a saúde do baralho informa quantos faltam, e oferece o caminho para resolver

#### Scenario: Jogo de escuta sem o áudio daquela nota
- **WHEN** um item seria usado num jogo que precisa de áudio e o arquivo não está disponível
- **THEN** o item usa voz sintética se houver voz para o idioma, e é omitido se não houver — nunca é apresentado sem som

### Requirement: A mídia é servida com segurança e sob demanda
O sistema SHALL servir a mídia importada apenas ao usuário dono dela, com suporte a reprodução
parcial.

#### Scenario: Reprodução de áudio longo
- **WHEN** o jogo pede um trecho do áudio
- **THEN** o servidor responde à faixa pedida, sem transferir o arquivo inteiro

#### Scenario: Acesso de outro usuário
- **WHEN** um usuário pede mídia que não é dele
- **THEN** o acesso é negado
