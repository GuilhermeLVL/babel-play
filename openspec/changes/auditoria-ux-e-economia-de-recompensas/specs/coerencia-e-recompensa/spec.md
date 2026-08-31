## ADDED Requirements

### Requirement: Liberdade classificada
Toda capacidade de edição do app SHALL ser classificada como DIREITO (sempre disponível) ou
RECOMPENSA (condicionada a nível, moeda ou conquista), e a interface SHALL respeitar a
classificação.

#### Scenario: Acessibilidade é direito
- **WHEN** o usuário ajusta tamanho de texto, contraste ou perfil de exibição
- **THEN** nada é cobrado nem trancado, em nenhum nível

#### Scenario: Estética é recompensa
- **WHEN** o usuário aplica um visual puramente estético que a progressão ainda não liberou
- **THEN** o app diz o que falta, e nenhum caminho alternativo entrega o mesmo resultado

### Requirement: Todo nível do passe entrega algo nomeável
Cada nível do passe SHALL entregar uma recompensa que o usuário consiga nomear ao recebê-la.

#### Scenario: Nível sem item
- **WHEN** um nível não tem item de catálogo para entregar
- **THEN** ele entrega um bloco de moeda ou capacidade — nunca uma fração que passe despercebida

### Requirement: Voltar ao original
O usuário SHALL conseguir restaurar o visual padrão do app em um clique.

#### Scenario: Restauração
- **WHEN** o usuário pede para voltar ao visual original
- **THEN** tema, fonte, partículas, cursor, rastro e paleta voltam aos padrões, e o que ele
  possui continua possuído
