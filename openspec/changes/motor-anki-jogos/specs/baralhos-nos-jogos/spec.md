## ADDED Requirements

### Requirement: Dá para jogar com um baralho específico

O sistema SHALL permitir escolher um baralho importado como fonte da rodada, e SHALL usar somente
itens daquele baralho quando ele for escolhido.

#### Scenario: Baralho escolhido

- **WHEN** o usuário escolhe um baralho importado no lobby
- **THEN** a rodada usa apenas palavras daquele baralho

#### Scenario: Nenhum baralho escolhido

- **WHEN** o usuário não escolhe baralho nenhum
- **THEN** a rodada usa todo o acervo, incluindo o que veio de baralhos, como já acontecia

#### Scenario: Filtro não pôde ser aplicado

- **WHEN** o app está sem servidor e não tem como saber de qual baralho cada palavra veio
- **THEN** ele diz que o filtro por baralho não pôde ser aplicado, em vez de jogar com tudo em silêncio

### Requirement: A origem do item é visível antes de jogar

O sistema SHALL mostrar, na prévia da rodada, de qual baralho o material vem.

#### Scenario: Rodada com material de baralho

- **WHEN** a prévia é exibida para uma rodada montada com itens importados
- **THEN** ela identifica o baralho de origem

#### Scenario: Frase do baralho não é rotulada como sessão

- **WHEN** a prévia de um jogo de frase usa frases vindas de um baralho
- **THEN** o rótulo é "Anki · nome do baralho", e nunca "sessão"

#### Scenario: Anti-spoiler preservado

- **WHEN** a origem é exibida
- **THEN** ela não revela a resposta do jogo, respeitando o que aquele jogo pode mostrar

### Requirement: Frase de exemplo do baralho alimenta os jogos de frase

O sistema SHALL usar a frase de exemplo das notas importadas como material dos jogos de frase, com
áudio nativo quando existir.

#### Scenario: Nota com frase (revisão de 25/11/2026)

O áudio nativo do `.apkg` não chega ao servidor (mídia cancelada; importação pesada no navegador, retenção zero): todo texto abaixo
vale para a frase falada por voz sintética.

- **WHEN** a nota tem frase de exemplo com 4 palavras ou mais e existe voz para o idioma
- **THEN** ela alimenta escuta e ditado por voz sintética (`startMs:0,endMs:0`), e não alimenta karaokê

#### Scenario: Karaokê com frase do baralho

- **WHEN** a rodada de karaokê só tem frases do baralho, sem clipe de áudio
- **THEN** o jogo aparece indisponível com o motivo dito, e não como rodada vazia

#### Scenario: Gravação do usuário tem prioridade

- **WHEN** existe fala gravada do idioma e também frase do baralho
- **THEN** a rodada de escuta usa só as gravadas, para o timbre não entregar a resposta

#### Scenario: Sem frase

- **WHEN** as notas do baralho não têm frase de exemplo
- **THEN** os jogos de frase ficam indisponíveis para esse baralho, com o motivo dito na tela

### Requirement: Cada jogo declara o que precisa, e a falta tem consequência dita

O sistema SHALL decidir a elegibilidade de cada item por jogo, e SHALL informar o motivo quando um
jogo não estiver disponível para um baralho.

#### Scenario: Item sem tradução

- **WHEN** a nota não tem significado
- **THEN** ela fica fora dos jogos que exigem tradução, e continua disponível para os que não exigem

#### Scenario: Baralho em alfabeto não latino

- **WHEN** o baralho usa um sistema de escrita que o caça-palavras e o termo não suportam
- **THEN** esses jogos aparecem indisponíveis com o motivo, e não como grade vazia

#### Scenario: Item que não serve a nenhum jogo

- **WHEN** um item importado não atende aos requisitos de nenhum minijogo
- **THEN** ele continua disponível para revisão simples, contando na memória, em vez de desaparecer

### Requirement: Jogar com material importado conta na memória como qualquer outro

O sistema SHALL registrar acertos e erros de itens importados no mesmo mecanismo de memória usado
pelo restante do app.

#### Scenario: Acerto num item de baralho

- **WHEN** o usuário acerta um item vindo de baralho importado num jogo que grava progresso
- **THEN** a memória daquele item é atualizada como a de qualquer outro cartão

#### Scenario: Estatística por baralho

- **WHEN** o usuário consulta o baralho depois de jogar
- **THEN** ele vê quanto daquele baralho já foi praticado
