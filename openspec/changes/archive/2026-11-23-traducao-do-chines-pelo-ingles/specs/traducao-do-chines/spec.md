## ADDED Requirements

### Requirement: Chinês traduz no aparelho, passando pelo inglês

O tradutor local SHALL traduzir do chinês para o inglês, português, espanhol, francês, italiano e alemão sem enviar texto para
fora do aparelho, passando pelo inglês para os alvos que não são o inglês. O tradutor MUST NOT afirmar cobertura para
chinês→romeno/catalão/galego nem para nenhum alvo→chinês.

#### Scenario: Fala em mandarim sem consentimento de nuvem

- **WHEN** a pessoa fala em mandarim, o Chrome Translator não está disponível e a nuvem não foi autorizada
- **THEN** a legenda mostra a tradução em português feita pelo tradutor local (zh→en→pt)

#### Scenario: Modelo ainda carregando

- **WHEN** um dos dois modelos do pivô ainda não carregou
- **THEN** o tradutor local falha rápido, pede a carga dos dois e a cascata segue; um trecho parcial nunca dispara o download

### Requirement: Frases do chinês são traduzidas uma a uma

O separador de frases MUST tratar `。`, `！` e `？` como fim de frase, sem exigir espaço nem maiúscula depois, e MUST NOT mudar a
separação dos idiomas com espaço.

#### Scenario: Duas frases em chinês

- **WHEN** o texto é `我喜欢学习中文。今天天气很好！`
- **THEN** são duas frases, cada uma traduzida na sua chamada
