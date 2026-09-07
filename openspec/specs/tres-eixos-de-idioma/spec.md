# tres-eixos-de-idioma Specification

## Purpose
TBD - created by archiving change idioma-alvo-e-ui-respeitados. Update Purpose after archive.
## Requirements
### Requirement: Cada eixo tem uma fonte
O idioma da interface, o idioma-alvo e o idioma do conteudo SHALL ter uma unica fonte de verdade cada; espelhos sao derivados e nunca gravados de forma independente.

#### Scenario: Alvo alterado em Ajustes
- **WHEN** o usuario muda o idioma que estuda
- **THEN** `settings.targetLanguage` e o unico campo gravado e todas as telas que praticam, analisam e medem passam a usar o novo valor

### Requirement: O usuario escolhe o idioma da interface
A interface SHALL ter um seletor de idioma independente de "Meu idioma", oferecendo apenas catalogos com cobertura suficiente.

#### Scenario: Falante de portugues que quer a UI em ingles
- **WHEN** o usuario escolhe ingles no seletor
- **THEN** a interface muda, `users.locale` (ou `ui.uiLang`) e gravado, e a direcao de microfone/traducao nao muda

### Requirement: A onboarding pergunta o idioma
A onboarding da edicao completa SHALL perguntar o idioma-alvo e o idioma da interface antes de liberar o app.

#### Scenario: Conta nova
- **WHEN** um usuario novo conclui a onboarding
- **THEN** `settings.targetLanguage` e o idioma da interface estao gravados com a escolha dele, nao com um default

### Requirement: Classificacao e voz por idioma
Nivel CEFR, fluencia, regua gramatical, vicios, stopwords, preparacao de fala e sintese de voz SHALL receber o idioma do item ou do eixo, e SHALL declarar ausencia de regua em vez de aplicar a regua de outro idioma.

#### Scenario: Nivel de uma palavra em espanhol no servidor
- **WHEN** um cartao com `src_lang = 'es'` e criado
- **THEN** `nivelCefr('hola', 'es')` devolve o nivel da lista de espanhol, nao `null`

#### Scenario: Analise de uma sessao em frances
- **WHEN** a tela de metricas calcula vicios e voz passiva para falas em frances
- **THEN** os paineis dizem "sem regua para frances" em vez de mostrar zero

### Requirement: Locale cravado nao passa no CI
Nenhum codigo de apresentacao SHALL formatar numero, data ou moeda com locale literal.

#### Scenario: Intl com pt-BR literal
- **WHEN** um arquivo contem `new Intl.NumberFormat('pt-BR')`
- **THEN** `ast-grep scan` acusa a linha e o CI falha

