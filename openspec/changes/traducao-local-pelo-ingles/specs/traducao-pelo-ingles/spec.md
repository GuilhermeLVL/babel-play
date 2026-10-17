## ADDED Requirements

### Requirement: Os idiomas aprovados traduzem no aparelho pelo inglês

O tradutor local SHALL traduzir de zh, ja, ko, ru, ar, tr, pl, nl, uk, sv, fi, cs, hu, id e th para inglês, português, espanhol,
francês, italiano e alemão sem enviar texto para fora, passando pelo inglês para os alvos que não são o inglês. O tradutor
MUST NOT anunciar cobertura para o sentido contrário, nem para hindi e vietnamita, nem para os pares entre idiomas que já têm
modelo direto.

#### Scenario: Fala em japonês sem nuvem

- **WHEN** a pessoa ouve japonês, o tradutor nativo não está pronto e a nuvem não foi autorizada
- **THEN** a legenda mostra a tradução em português do tradutor local (ja→en→pt)

#### Scenario: Idioma fora da lista

- **WHEN** o par é hindi → português
- **THEN** a cobertura anunciada é "online" e o aparelho não baixa modelo de tradução

### Requirement: Frases de alfabetos sem maiúscula são separadas

O separador de frases MUST tratar o ponto, o `!` e o `?` seguidos de letra sem caixa (hangul, árabe) como fim de frase, e o `؟`
como terminador, sem mudar a separação dos alfabetos com maiúscula.

#### Scenario: Duas frases em coreano

- **WHEN** o texto é `저는 언어를 공부하는 것을 좋아해요. 오늘은 날씨가 좋으니까 공원에 산책하러 가요.`
- **THEN** são duas frases, cada uma traduzida na sua chamada
