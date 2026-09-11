## ADDED Requirements

### Requirement: O redesign lê nos 7 temas, claro e escuro, nos 3 viewports

Cada tela reestruturada SHALL ter evidência visual nos temas além do babel, e nenhum componente
global SHALL usar cor fora dos tokens do tema.

#### Scenario: Painel escuro no tema aurora claro

- **WHEN** o tema é aurora em modo claro
- **THEN** o painel "jogando com" e o hero de Capturar usam os `--panel-*` do aurora, com texto
  em `--panel-ink` legível (par coberto por `contrastePaletas`)
