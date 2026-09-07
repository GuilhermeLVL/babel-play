# entrega-honesta Specification

## Purpose
TBD - created by archiving change entregar-o-que-ja-existe. Update Purpose after archive.
## Requirements
### Requirement: A tela mostra o que o nome dela promete
Uma tela nomeada por um acervo SHALL mostrar esse acervo sem exigir navegação extra.

#### Scenario: Minhas Palavras abre com palavras
- **WHEN** o usuário abre "Minhas Palavras" com cartões no caderno
- **THEN** a lista de palavras está visível na primeira tela, em qualquer perfil de exibição

#### Scenario: Export cumpre o rótulo
- **WHEN** o usuário aciona "Exportar Meu Caderno"
- **THEN** o arquivo gerado contém as palavras do caderno, não apenas números agregados

### Requirement: Gráfico não desenha o que não informa
Uma visualização SHALL desenhar o dado que existe, ou não desenhar.

#### Scenario: Série de um ponto
- **WHEN** a evolução do vocabulário tem uma única semana de dado
- **THEN** o ponto é desenhado (uma linha invisível não é honestidade, é ausência)

#### Scenario: Distribuição sem base
- **WHEN** a única fatia da distribuição de nível é "sem nível conhecido"
- **THEN** o gráfico não é desenhado, e o texto que explica a ausência basta

### Requirement: Cartão sem verso não nasce em silêncio
O app SHALL impedir, ou declarar no ato, a criação de cartão sem tradução por idiomas iguais.

#### Scenario: Idiomas iguais na captura
- **WHEN** o idioma que se aprende e o idioma do usuário são o mesmo e uma palavra é fichada
- **THEN** o app não cria um cartão de verso vazio em silêncio; diz o que está acontecendo e
  oferece o caminho de conserto

### Requirement: A promessa pública corresponde ao produto
Os textos do app SHALL descrever o que o app faz, incluindo o que é pago.

#### Scenario: Página Sobre com planos existentes
- **WHEN** existem planos pagos e itens comprados com dinheiro
- **THEN** a página Sobre declara o que é grátis para sempre e o que é pago, sem prometer
  gratuidade universal nem acusar o modelo que o próprio app adota

### Requirement: Escolha de captura é direta
Os controles de gravação SHALL expor as fontes de áudio que serão usadas, e não uma abstração
que o usuário precise decodificar.

#### Scenario: Interruptores no lugar de cenários
- **WHEN** o usuário prepara uma gravação
- **THEN** ele liga ou desliga "som do computador" e "meu microfone" diretamente, e o modo da
  sessão é consequência dessa escolha

#### Scenario: Nenhuma fonte selecionada
- **WHEN** as duas fontes estão desligadas
- **THEN** o app não permite iniciar e diz o que falta ligar

