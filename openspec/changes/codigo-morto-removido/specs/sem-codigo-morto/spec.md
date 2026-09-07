## ADDED Requirements

### Requirement: O CI recusa codigo sem uso
O CI SHALL falhar quando existir arquivo de produto sem importador, export sem uso, dependencia sem uso, ciclo de importacao ou warning de lint.

#### Scenario: Export esquecido
- **WHEN** um PR deixa uma funcao exportada sem chamador
- **THEN** o passo `knip` do CI falha citando o arquivo e o simbolo

#### Scenario: Warning de lint
- **WHEN** um PR introduz uma variavel nao usada
- **THEN** `eslint --max-warnings 0` falha

### Requirement: Erro engolido tem motivo escrito
Todo `catch` vazio ou `.catch(() => {})` SHALL ter um comentario com o motivo ou tratar o erro.

#### Scenario: Efeito sonoro falha
- **WHEN** a Web Audio API lanca ao tocar um efeito
- **THEN** o `catch` registra o motivo (ambiente sem audio) em comentario e o `ast-grep scan` nao acusa

### Requirement: Rota sem consumidor nao existe
Toda rota do servidor SHALL ter ao menos um chamador no cliente, um consumidor externo declarado (probe, webhook) ou uma tela de administracao.

#### Scenario: Rota administrativa
- **WHEN** `/api/admin/*` existe
- **THEN** ha uma tela ou documentacao de uso que a consome, ou a rota e removida
