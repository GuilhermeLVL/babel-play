## ADDED Requirements

### Requirement: O cartão da palavra não bloqueia a leitura

Ao tocar numa palavra do livro, o leitor SHALL mostrar um cartão não modal (`aria-modal="false"`), sem fundo
escurecido ou borrado e sem prender o foco. O cartão MUST NOT pausar nem parar a narração ao abrir ou fechar.

#### Scenario: Tocar numa palavra durante a narração

- **WHEN** a narração está tocando e a pessoa toca em "Call"
- **THEN** o cartão aparece perto da palavra, a narração segue tocando e o texto do livro continua visível

#### Scenario: Fechar

- **WHEN** a pessoa aperta Esc, toca fora do cartão, vira a página ou seleciona um trecho
- **THEN** o cartão fecha; se foi aberto pelo teclado, o foco volta à palavra

#### Scenario: Outra palavra

- **WHEN** o cartão está aberto e a pessoa toca outra palavra
- **THEN** o mesmo cartão mostra a palavra nova, sem empilhar

### Requirement: O cartão nunca cobre a palavra tocada

O cartão SHALL ficar abaixo da palavra quando couber, acima quando não couber, e no celular (≤ 600 px) SHALL
ser uma mini-folha com no máximo 40% da altura, presa embaixo, ou no topo quando embaixo cobriria a palavra.

#### Scenario: Palavra no pé da página no computador

- **WHEN** a palavra está a 40 px do fim da janela e o cartão tem 220 px
- **THEN** o cartão abre acima da palavra

#### Scenario: Palavra no pé da tela no celular

- **WHEN** a janela tem 390 px de largura e a palavra está na parte baixa da tela
- **THEN** a mini-folha fica no topo

### Requirement: O essencial em uma olhada

A visão inicial SHALL mostrar a palavra (com fonética só se o verbete trouxer), a melhor tradução no contexto
em uma linha e as ações rápidas Ouvir, Traduzir a frase, Sentido, Salvar e Mais, com alvos de pelo menos 44 px.
"Mais" SHALL expandir no próprio cartão o dicionário, o exemplo, os links (Wiktionary, Forvo) e uma seção
"Fontes" recolhida com procedência e licenças.

#### Scenario: Traduzir a frase

- **WHEN** a pessoa toca "Traduzir a frase"
- **THEN** o cartão anuncia "Traduzindo a frase…" (`aria-live="polite"`) e mostra a tradução da frase dentro
  dele; uma segunda vez sai do cache; se falhar, diz o fato e oferece "Tentar de novo"

#### Scenario: Salvar

- **WHEN** a pessoa toca "Salvar"
- **THEN** a palavra vai para o deck com a frase do livro e o chip passa a mostrar "Salva"

### Requirement: Sentido escolhido pelo contexto

Uma função pura SHALL ordenar os sentidos do verbete pela frase e pela posição da palavra, e MUST NOT
preferir nome próprio para palavra em minúscula ou no começo da frase quando ela também é palavra comum.

#### Scenario: Call me Ishmael

- **WHEN** a frase é "Call me Ishmael." e a palavra é "Call" na posição 0
- **THEN** a consulta é "call" e o primeiro sentido é de verbo

#### Scenario: Nome próprio no meio da frase

- **WHEN** a frase é "Mr. Call arrived." e a palavra é "Call"
- **THEN** o nome próprio vem primeiro e a consulta mantém "Call"

### Requirement: Imagem só para quem pode ver

O cartão SHALL mostrar no máximo uma miniatura da busca de imagens que o app já tem, com a licença quando
houver, e MUST NOT buscar nem mostrar imagem externa no perfil protegido.

#### Scenario: Perfil protegido

- **WHEN** a pessoa é menor de idade ou não declarou a idade
- **THEN** o cartão não busca imagem e não mostra espaço para ela
