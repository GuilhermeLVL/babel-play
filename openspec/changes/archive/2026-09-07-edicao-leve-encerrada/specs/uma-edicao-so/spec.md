## ADDED Requirements

### Requirement: Existe um unico build
O aplicativo SHALL ter uma unica edicao. O que varia entre ambientes SHALL ser configuracao (variavel de ambiente lida em tempo de execucao), e SHALL NOT ser um segundo conjunto de telas, de menu ou de rotas escolhido em tempo de build.

#### Scenario: Tela nova
- **WHEN** uma tela e acrescentada ao aplicativo
- **THEN** ela existe para todos, e quem pode abri-la e decidido pelo gate de conta por tela, em tempo de execucao

#### Scenario: Sinalizador de edicao
- **WHEN** alguem procura por `EDICAO_LEVE` ou `VITE_EDICAO` no repositorio
- **THEN** nao ha ocorrencia: nem a constante, nem o arquivo que a definia, nem os ramos que a liam

### Requirement: O modo sem conta sobrevive a edicao
O modo sem conta (servidor em memoria sobre IndexedDB) SHALL continuar funcionando na edicao unica: quem entra sem conta captura, ficha palavras, joga e ve o proprio progresso, tudo no navegador.

#### Scenario: Primeira visita sem conta
- **WHEN** alguem abre o aplicativo sem sessao
- **THEN** entra direto, com a identidade anonima, e nenhuma requisicao de dado sai para a rede

### Requirement: O ranking global e servido pelo proprio aplicativo
O placar publico dos minijogos SHALL ser servido por `/api/rank`, antes da autenticacao, e SHALL funcionar igual com e sem conta.

#### Scenario: Envio de pontuacao
- **WHEN** alguem termina uma partida e envia a pontuacao com um apelido valido
- **THEN** ela entra no placar daquele jogo, e um envio pior depois nao apaga o recorde

#### Scenario: Pontuacao implausivel
- **WHEN** chega uma pontuacao acima do teto do jogo
- **THEN** ela e recusada com 400 — o teto existe para a trapaca nao esconder o resto da tabela

#### Scenario: Envios seguidos da mesma origem
- **WHEN** duas pontuacoes chegam da mesma origem em menos de um minuto
- **THEN** a segunda recebe 429

#### Scenario: Privacidade da trava de flood
- **WHEN** um envio e gravado
- **THEN** o que fica na linha e um HASH da origem, e nao o endereco: a tabela nao tem coluna para guardar endereco
