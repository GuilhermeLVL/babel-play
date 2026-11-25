## ADDED Requirements

### Requirement: Um seletor de itens para a revisão e para os jogos

O sistema SHALL ter uma função pura em `src/core/selecao/` que devolve quais itens, em que ordem e em que dificuldade, usada pela Revisão e pelos jogos, no servidor e na edição estática, com uma só definição de "palavra difícil".

#### Scenario: Mesmo estado, mesma escolha

- **WHEN** o servidor e a edição estática recebem o mesmo acervo e o mesmo histórico
- **THEN** escolhem os mesmos itens na mesma ordem

#### Scenario: Caracterização antes da troca

- **WHEN** o seletor novo substitui as regras antigas
- **THEN** os testes de caracterização do comportamento anterior continuam verdes, e qualquer diferença intencional aparece como mudança de snapshot revisada

### Requirement: Jogo só mexe na memória quando é recordação

O sistema SHALL gravar nota de agendamento a partir de um jogo apenas quando a resposta exigiu recordar sem alternativas, no máximo uma vez por palavra por dia.

#### Scenario: Reconhecer não mexe na agenda

- **WHEN** a pessoa acerta um jogo de reconhecer entre alternativas
- **THEN** nenhuma linha de revisão com efeito na agenda é gravada

#### Scenario: Recordar conta uma vez por dia

- **WHEN** a pessoa acerta a mesma palavra duas vezes em jogos de recordação no mesmo dia
- **THEN** só a primeira move a agenda

#### Scenario: Pressão de tempo

- **WHEN** a pessoa erra por estouro do tempo do jogo
- **THEN** o erro não vira lapso no FSRS

### Requirement: Dificuldade adaptativa nasce desligada

O sistema SHALL manter a dificuldade adaptativa dos jogos atrás de flag semeada desligada, e SHALL medir acerto e abandono por rodada antes de qualquer ligação.

#### Scenario: Flag desligada

- **WHEN** a flag está desligada
- **THEN** a dificuldade dos jogos é a de hoje, sem diferença observável

#### Scenario: Flag ligada

- **WHEN** a flag está ligada e a pessoa acerta acima da faixa alvo por três rodadas
- **THEN** a dificuldade sobe em um passo, e desce mais devagar quando o acerto cai abaixo da faixa

### Requirement: Chave de duplicata não funde palavras diferentes

O sistema SHALL distinguir palavras que diferem por acento ou marca quando isso muda o sentido no idioma, e SHALL manter iguais as variações só de caixa e de pontuação.

#### Scenario: Palavras distintas

- **WHEN** a pessoa salva `año` e depois `ano` em espanhol
- **THEN** existem dois cartões, cada um com a sua tradução

#### Scenario: Mesma palavra

- **WHEN** a pessoa salva `Água!` e depois `agua` em português
- **THEN** a segunda cai no cartão existente

#### Scenario: Migração reversível

- **WHEN** a migração de chaves roda sobre uma cópia do banco
- **THEN** o número de cartões e de revisões do usuário é conferido antes e depois, o relatório lista os cartões separados e a reversão restaura o estado anterior

### Requirement: Dado de comportamento fora de anúncio e de perfil

O sistema SHALL tratar tempo de resposta e erros como dado de comportamento: não entram em anúncio, não alimentam perfil e não inferem condição de aprendizagem.

#### Scenario: Anúncio e perfil

- **WHEN** o servidor monta o contexto de um anúncio ou o perfil da pessoa
- **THEN** nenhum campo derivado de tempo de resposta ou de erros é usado

#### Scenario: Exportação e exclusão

- **WHEN** a pessoa exporta ou exclui a conta
- **THEN** os registros novos (tempo, agregados, estado por item) entram na exportação e são apagados na exclusão

### Requirement: Métricas honestas

O sistema SHALL dizer "você conhece X% das palavras" e SHALL NOT afirmar "você entende X%" nem nível CEFR por contagem de palavras.

#### Scenario: Cobertura de um texto

- **WHEN** a tela mostra a cobertura de um vídeo ou texto
- **THEN** o texto exibido usa "conhece X% das palavras" e não afirma compreensão

#### Scenario: Base mínima

- **WHEN** há menos de 20 revisões na janela medida
- **THEN** a tela não mostra percentual de retenção
