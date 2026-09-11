## ADDED Requirements

### Requirement: Os jogos usam só tokens do tema

Nenhum jogo SHALL usar cor da paleta do Tailwind (`*-500` etc.) nem hex literal em className; o
selo de combo SHALL ler com o par `warn`/`--warn-contrast` em todos os temas.

#### Scenario: Selo de combo no tema mochi

- **WHEN** a pessoa acerta em sequência no Ditado com o tema mochi ativo
- **THEN** o selo "xN" aparece com o preenchimento `warn` do mochi e texto no `--warn-contrast` desse tema
