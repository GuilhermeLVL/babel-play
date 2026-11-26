## ADDED Requirements

### Requirement: Estado vazio compacto e informativo

Enquanto a legenda flutuante não tem fala nenhuma, ela SHALL mostrar de onde a captura ouve e o nível do som que chega, e MUST NOT
mostrar só um retângulo vazio. Passados 6 segundos de captura sem nenhum som acima do ruído, SHALL orientar a pessoa a tocar algo.
Com a captura parada, SHALL dizer que está parada.

#### Scenario: Ouvindo a aba, ainda sem fala

- **WHEN** a janela abre com a captura rodando sobre uma aba e nenhuma fala chegou
- **THEN** ela mostra "Ouvindo o som da aba · esperando a primeira fala" e um medidor de cinco barras que acompanha o nível

#### Scenario: Seis segundos sem som

- **WHEN** a captura roda e nenhum som passa do ruído por 6 segundos
- **THEN** a janela mostra "Nenhum som chegou ainda. Dê play em algo."

### Requirement: A janela abre baixa até a primeira fala

A Document PiP SHALL abrir com 96 px de altura, na largura do formato, quando não há fala; com falas, SHALL abrir no tamanho do
formato. Ao chegar a primeira fala, a janela SHALL tentar crescer até o tamanho do formato (na hora e no primeiro gesto da pessoa
dentro dela). O tamanho baixo MUST NOT ser guardado como o tamanho preferido da pessoa.

#### Scenario: Abrir antes de falar

- **WHEN** a pessoa abre a legenda flutuante antes de qualquer fala
- **THEN** a janela é pedida com a largura do formato e 96 px de altura

### Requirement: Atalhos de aparência na janela

Com o foco na janela, as teclas `+` e `-` SHALL aumentar e diminuir a letra, `O` SHALL alternar entre original, tradução e os dois, e
`F` SHALL trocar o fundo. A escolha SHALL ser guardada como as demais da aparência.

#### Scenario: Aumentar a letra pelo teclado

- **WHEN** a pessoa tecla `+` com a janela em foco
- **THEN** a letra sobe um passo (10%) e a escolha é guardada
