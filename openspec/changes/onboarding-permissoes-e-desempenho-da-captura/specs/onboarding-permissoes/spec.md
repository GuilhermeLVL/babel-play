## ADDED Requirements

### Requirement: Passo de permissões no onboarding

O onboarding SHALL ter um passo "permissões" entre "laço" e "privacidade". O passo MUST oferecer um botão que pede o
microfone uma vez e MUST soltar a faixa logo após a resposta. O passo MUST ser pulável e MUST NOT impedir a pessoa de
concluir o onboarding, qualquer que seja a resposta do navegador.

#### Scenario: Pessoa permite o microfone

- **WHEN** a pessoa toca no botão e permite o microfone
- **THEN** o passo mostra o microfone como liberado e a faixa de áudio é encerrada

#### Scenario: Pessoa nega o microfone

- **WHEN** a pessoa nega a permissão
- **THEN** o passo mostra a mensagem de `micErrorMessage` com como reativar, e "Continuar" segue disponível

#### Scenario: Pessoa pula o passo

- **WHEN** a pessoa escolhe "Agora não"
- **THEN** o onboarding avança sem pedir nada, e o microfone continua sendo pedido no primeiro "Iniciar"

### Requirement: Captura de aba é explicada, não pré-autorizada

O passo MUST explicar que compartilhar a aba ou a tela abre o seletor do navegador a cada captura e MUST NOT chamar
`getDisplayMedia`.

#### Scenario: Passo exibido

- **WHEN** o passo de permissões é exibido
- **THEN** há um texto sobre o seletor de aba/tela e nenhum seletor é aberto
