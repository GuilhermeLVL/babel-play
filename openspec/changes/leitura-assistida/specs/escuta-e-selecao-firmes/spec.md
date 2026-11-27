## ADDED Requirements

### Requirement: O player da escuta guiada é compacto e não cobre a transcrição

Com a flag `escuta_player_compacto` ligada, o player SHALL ocupar uma única barra e a transcrição SHALL reservar o espaço dela, de modo que
nenhuma linha fique coberta. Com a flag desligada, o player SHALL permanecer como hoje.

#### Scenario: Computador

- **WHEN** a escuta guiada abre numa janela de 1280x720 e a transcrição é rolada até o fim
- **THEN** a última linha fica visível acima da barra, com 0 px de sobreposição

#### Scenario: Celular

- **WHEN** a escuta guiada abre em 390x844 com a área segura do aparelho
- **THEN** o player é uma barra de uma fileira, a velocidade vira menu, e nada da transcrição fica coberto

#### Scenario: Flag desligada

- **WHEN** `escuta_player_compacto` está desligada
- **THEN** o player e o layout são idênticos aos de hoje

### Requirement: A seleção respeita palavras e blocos

Com a flag `leitor_selecao_firme` ligada, o início e o fim de uma seleção SHALL cair em bordas de palavra, pontos fora do texto SHALL ser
descartados, e uma seleção iniciada por arrasto MUST NOT passar para outro bloco ou outra coluna por deriva do gesto.

#### Scenario: Arrasto termina no meio de uma palavra

- **WHEN** a pessoa solta o dedo no meio de "wonderful"
- **THEN** a seleção termina no fim de "wonderful"

#### Scenario: Ponto na margem ou entre colunas

- **WHEN** o arrasto passa por um ponto sem texto (margem, vão entre colunas)
- **THEN** esse ponto é ignorado e o fim da seleção fica na última palavra realmente tocada

#### Scenario: Arrasto cruza para a outra coluna

- **WHEN** o arrasto começa num parágrafo da coluna esquerda e o dedo escorrega para a coluna direita
- **THEN** a seleção termina no fim do bloco onde começou e nenhum texto da outra coluna é incluído

### Requirement: Gestos de seleção previsíveis

Com a flag ligada, um toque SHALL selecionar a palavra, um toque duplo ou longo SHALL selecionar a frase, e um toque triplo SHALL selecionar o parágrafo.

#### Scenario: Toque na palavra

- **WHEN** a pessoa toca em "was"
- **THEN** só "was" fica selecionada e o trecho é publicado no barramento da seleção

#### Scenario: Toque duplo

- **WHEN** a pessoa dá dois toques numa palavra
- **THEN** a frase inteira fica selecionada, sem passar do bloco

### Requirement: Alças ajustam a seleção palavra a palavra

Com a flag ligada, a seleção SHALL ter duas alças fora do documento do livro, que movem o início e o fim de palavra em palavra, e só elas MAY estender a seleção além do bloco.

#### Scenario: Arrastar a alça final

- **WHEN** a pessoa arrasta a alça final para a palavra seguinte
- **THEN** o fim avança exatamente uma palavra por vez e o trecho publicado é atualizado

### Requirement: O gesto funciona também no Safari

Se os eventos de toque não chegarem ao app (WebKit, iframe sem scripts), o leitor SHALL continuar usável pelo caminho de seleção atual e MUST NOT perder a seleção feita.

#### Scenario: WebKit

- **WHEN** o e2e roda em WebKit com a flag ligada
- **THEN** tocar uma palavra a seleciona e abre a barra da seleção

### Requirement: O foliate só muda com registro

Qualquer mudança em `src/lib/leitor/foliate/` SHALL carregar o comentário `FRASY:` e uma linha em `foliate/PATCHES.md`.

#### Scenario: Diff do foliate

- **WHEN** a fatia termina
- **THEN** toda linha alterada no foliate tem `FRASY:` e consta em `PATCHES.md`
