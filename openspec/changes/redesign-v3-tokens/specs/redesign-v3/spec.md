## ADDED Requirements

### Requirement: Todo fundo novo entra na matriz de contraste

Todo token que aparece como FUNDO em alguma tela SHALL estar em `tests/contrastePaletas.test.ts`
com os textos que se compõem sobre ele, em todos os temas e modos, com mínimo 4,5:1.

#### Scenario: Token de fundo derivado

- **WHEN** um token de fundo é acrescentado a `src/index.css`
- **THEN** o commit acrescenta os pares texto/fundo ao teste e o teste passa em todas as 14 combinações

### Requirement: O hover do botão primário respeita o texto de contraste

`--accent-hover` SHALL manter `--accent-contrast` ≥ 4,5:1 em todo tema; para isso ele clareia o
accent quando o texto de contraste é escuro e escurece quando é claro.

#### Scenario: Tema com texto de contraste escuro

- **WHEN** `--accent-contrast` do tema é escuro (babel claro)
- **THEN** `--accent-hover` é mais claro que `--accent`, e o par passa de 4,5:1
