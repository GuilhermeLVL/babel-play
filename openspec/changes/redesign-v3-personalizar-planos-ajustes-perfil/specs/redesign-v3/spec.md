## ADDED Requirements

### Requirement: Ajustes, Planos e Perfil vestem o cabeçalho único sem mudar o contrato

As três telas SHALL manter um único `<h1>` com o mesmo texto de antes por perfil (kids/senior/pro),
as mesmas abas nomeadas e os mesmos rótulos, ao adotar `CabecalhoDeTela`.

#### Scenario: O título de Ajustes segue o perfil

- **WHEN** o perfil de exibição é `senior`
- **THEN** a tela abre com o h1 "Ajustes do aplicativo" e o kicker "Painel de opções"
