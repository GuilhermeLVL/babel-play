# comunicacao-de-obtencao Specification

## Purpose
TBD - created by archiving change design-e-comunicacao-de-volta. Update Purpose after archive.
## Requirements
### Requirement: Todo cosmético é visível antes de ser possuído
O app SHALL ter pelo menos uma tela onde qualquer item do catálogo pode ser visto antes de o
usuário possuí-lo, incluindo os que não se compram (exclusivos de conquista e de nível).

#### Scenario: Peça de conquista que o usuário ainda não fez
- **WHEN** o usuário abre o inventário e pede o catálogo completo
- **THEN** a peça aparece na grade com cadeado, e continua aparecendo na contagem da sua categoria

#### Scenario: Categoria em que o usuário não tem nada
- **WHEN** o catálogo completo está ligado e o usuário não possui nenhuma peça daquele tipo
- **THEN** a categoria continua listada, com a contagem do catálogo e não a da posse

### Requirement: A peça trancada diz como se consegue
Toda peça que o usuário não pode equipar SHALL exibir o canal de obtenção, o que falta para
obtê-la, e um caminho para a tela que a entrega.

#### Scenario: Item exclusivo de conquista
- **WHEN** o usuário escolhe uma peça trancada por conquista
- **THEN** a tela mostra o NOME da conquista (nunca o id) e leva à tela de Conquistas

#### Scenario: Item com nível e preço em Seeds
- **WHEN** o usuário escolhe uma peça que destrava por nível e também tem atalho em Seeds
- **THEN** a tela cita os DOIS caminhos — o nível que a entrega de graça e o preço do atalho — e diz
  quanto falta do saldo atual

#### Scenario: Item da trilha premium
- **WHEN** o usuário escolhe uma peça com preço em Créditos que também ocupa uma casa do Passe
- **THEN** a tela cita o preço e a casa da trilha, e leva ao Passe

#### Scenario: Sem destino para onde mandar
- **WHEN** a tela é montada sem o callback de navegação daquele destino
- **THEN** o cartão explica a rota e NÃO oferece um botão que não levaria a lugar nenhum

### Requirement: A rota de obtenção nunca diz menos que o cadeado
A frase que explica como obter um item SHALL conter todo número e todo nome que `estadoDoItem` cita
no motivo do cadeado do mesmo item.

#### Scenario: Canal novo no cadeado
- **WHEN** `estadoDoItem` ganha um canal de bloqueio que `rotaDeObtencao` não cobre
- **THEN** o teste de contrato falha citando o id do item

#### Scenario: Rota que esconde metade do preço
- **WHEN** a rota de um item com nível e preço cita só o preço
- **THEN** o teste de contrato falha, porque o motivo do cadeado cita o nível

### Requirement: A tela não afirma saldo que não recebeu
Enquanto o saldo de uma moeda não tiver sido respondido pelo servidor, a interface SHALL exibir um
marcador de desconhecido, e NÃO um número.

#### Scenario: Carteira carregando
- **WHEN** o cabeçalho de temporada é montado antes de a resposta da carteira chegar
- **THEN** o lugar do número mostra "—", nunca "0"

#### Scenario: Instalação sem a moeda comprada
- **WHEN** a carteira não está disponível (self-host, modo sem conta)
- **THEN** o cartão da moeda comprada não é renderizado, em vez de ser renderizado vazio

### Requirement: A moeda tem nome escrito na tela
Cada saldo exibido SHALL trazer o nome da sua moeda em texto, e não apenas em `title` ou ícone.

#### Scenario: Uso por toque
- **WHEN** o usuário abre a tela num dispositivo sem cursor
- **THEN** consegue dizer qual saldo é de qual moeda sem depender de tooltip

### Requirement: Nenhuma informação de regra fica abaixo de um breakpoint
A tela que explica a economia SHALL mostrar, em qualquer largura, tanto o ganho quanto o limite de
cada regra.

#### Scenario: Tela estreita
- **WHEN** o usuário abre a lista de "como ganhar Seeds e XP" num celular
- **THEN** o teto de cada regra continua visível, junto do ganho a que ele se aplica

