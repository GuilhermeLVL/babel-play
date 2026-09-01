## ADDED Requirements

### Requirement: O primeiro acesso abre no app
Sem sessão e sem escolha registrada, a porta SHALL levar ao app, não à tela de login.

#### Scenario: Primeira visita em modo público
- **WHEN** alguém abre o app pela primeira vez com autenticação ligada
- **THEN** vê o app funcionando, não um formulário de login

#### Scenario: A porta continua alcançável
- **WHEN** a pessoa pede para entrar pelo menu, por um gate ou por um aviso
- **THEN** a tela de login aparece

#### Scenario: Quem já tem sessão
- **WHEN** existe sessão válida
- **THEN** o app abre direto, como antes

### Requirement: Sem conta, o acervo tem teto
O modo sem conta SHALL limitar quantas sessões e quantas palavras podem ser guardadas, e SHALL
avisar ao se aproximar do teto.

#### Scenario: Perto do teto
- **WHEN** o acervo local chega perto do limite
- **THEN** o app avisa o que vai acontecer e oferece a conta, sem bloquear a ação em curso

#### Scenario: No teto
- **WHEN** o limite é atingido
- **THEN** a próxima gravação ou palavra é recusada com o motivo e o caminho para a conta

#### Scenario: Com conta não há teto
- **WHEN** existe conta
- **THEN** o teto do modo anônimo não se aplica

### Requirement: A economia exige conta, a acessibilidade não
Loja, Passe e Desafios SHALL exigir conta. "Meu visual" e o perfil de exibição SHALL continuar
disponíveis sem conta.

#### Scenario: Loja sem conta
- **WHEN** alguém sem conta abre a aba Loja
- **THEN** vê o convite explicando por que a economia precisa de conta, e não a prateleira

#### Scenario: Perfil de exibição sem conta
- **WHEN** alguém sem conta abre "Meu visual"
- **THEN** consegue equipar o que é livre e mudar o perfil de exibição — acessibilidade não se
  tranca atrás de cadastro

### Requirement: Avisos por marco de uso
O app SHALL oferecer a conta em momentos em que a pessoa tem algo a perder, e SHALL não repetir o
mesmo aviso indefinidamente.

#### Scenario: Segunda sessão salva sem conta
- **WHEN** a segunda sessão é salva no navegador
- **THEN** o app diz o que se perde ao trocar de navegador e oferece a conta

#### Scenario: Aviso dispensado
- **WHEN** a pessoa dispensa um aviso
- **THEN** aquele marco não volta a avisar

### Requirement: Entrar com Google
A tela de entrada SHALL oferecer Google além de e-mail e senha.

#### Scenario: Provedor configurado
- **WHEN** o Supabase tem o provedor habilitado
- **THEN** o botão do Google aparece e leva ao fluxo do provedor

#### Scenario: Ambiente sem Supabase
- **WHEN** não há Supabase configurado
- **THEN** a tela avisa, como já avisa hoje, sem oferecer um botão que não funcionaria
