## ADDED Requirements

### Requirement: "Legendar agora" para quem já usou

A tela de captura SHALL mostrar o botão "Legendar agora" quando houver som do computador a capturar, a pessoa já tiver
legendado o som do computador neste navegador e não houver captura em andamento; o toque SHALL deixar só o som do
computador (microfone desligado), usar as escolhas lembradas e abrir o seletor do navegador sem diálogo intermediário
quando o download já foi confirmado.

#### Scenario: Quem já usou

- **GIVEN** o navegador lembra a última superfície e a confirmação do download
- **WHEN** a pessoa toca em "Legendar agora"
- **THEN** o `getDisplayMedia` é chamado uma vez, sem folha nem pergunta de motor

#### Scenario: Primeira vez

- **WHEN** a pessoa nunca legendou o som do computador neste navegador
- **THEN** o botão não aparece e o "Iniciar captura" segue como antes

#### Scenario: Celular

- **WHEN** o aparelho não captura o som do computador
- **THEN** o botão não aparece

### Requirement: O seletor do navegador chega pré-arrumado

O pedido do `getDisplayMedia` SHALL incluir `systemAudio: 'include'`, `selfBrowserSurface: 'exclude'` e `surfaceSwitching:
'include'`, e `video.displaySurface` (a última superfície; a aba na primeira vez) SOMENTE quando
`getSupportedConstraints().displaySurface` for verdadeiro. O pedido SHALL NOT incluir `preferCurrentTab`.

#### Scenario: Navegador com suporte

- **WHEN** o navegador declara suporte a `displaySurface`
- **THEN** o pedido leva a superfície lembrada

#### Scenario: Sem suporte

- **WHEN** o navegador não declara suporte
- **THEN** o pedido não leva `displaySurface`

### Requirement: A confirmação do download é lembrada só onde a pergunta é por tamanho

A confirmação "Baixar e iniciar" SHALL ser lembrada no aparelho do computador; SHALL NOT ser lembrada com economia de dados,
rede lenta, celular ou Quest, onde a pergunta continua a cada início.

#### Scenario: Desktop que já confirmou

- **WHEN** a pessoa confirmou o download antes e abre a captura de novo
- **THEN** o início não repete a folha do download

#### Scenario: Economia de dados

- **WHEN** a economia de dados está ligada
- **THEN** a folha do download aparece a cada início, como antes
