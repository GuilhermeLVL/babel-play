## MODIFIED Requirements

### Requirement: A glosa some quando a palavra vira conhecida

Quando a pessoa marcar "Já sei", a glosa da palavra SHALL sumir sem recarregar o capítulo. Com a flag `forca_na_legenda` ligada, uma
palavra com cartão SHALL perder a glosa quando a força chegar a 3 (`FORCA_QUE_APAGA_A_GLOSA`), e MUST manter a glosa nas forças 1 e 2;
com a flag desligada, a glosa SHALL sumir quando a palavra entrar no caderno como aprendendo ou dominada, como hoje. Depois de
qualquer uma dessas mudanças, as glosas restantes SHALL ser refeitas pela mesma regra de densidade (uma palavra que ficou de fora
pode aparecer).

#### Scenario: Marcar "Já sei"

- **WHEN** a pessoa marca "Já sei" numa palavra glosada
- **THEN** a glosa dela some do capítulo atual sem recarga

#### Scenario: Palavra com força 2 (flag ligada)

- **WHEN** a palavra tem cartão com força 2 (estabilidade abaixo de 3 dias)
- **THEN** a glosa continua no capítulo

#### Scenario: Palavra chega à força 3 (flag ligada)

- **WHEN** uma revisão leva a palavra à força 3 e o índice é relido
- **THEN** a glosa dela some do capítulo atual sem recarregar, e a densidade das demais é refeita

#### Scenario: Flag desligada

- **WHEN** `forca_na_legenda` está desligada e a palavra entra no caderno como aprendendo
- **THEN** a glosa some como na regra anterior
