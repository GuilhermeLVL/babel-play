# replica-sem-estado-local Specification

## Purpose
TBD - created by archiving change replica-sem-estado-local-e-config-completa. Update Purpose after archive.
## Requirements
### Requirement: Segredo compartilhavel entre processos
A chave que cifra credenciais SHALL ser lida do ambiente ou de um arquivo no diretorio de dados declarado, nunca do diretorio de trabalho do processo.

#### Scenario: Dois processos, um diretorio de dados
- **WHEN** dois processos sobem com o mesmo `DATA_DIR` e sem `SECRET_KEY`
- **THEN** ambos decifram um segredo gravado por qualquer um deles

### Requirement: Saude igual em todo processo
`/api/health` SHALL responder o mesmo estado de boot em qualquer processo do cluster.

#### Scenario: Migracao falhou no primario
- **WHEN** o primario registra falha de boot e um worker recebe a probe
- **THEN** o worker responde `degraded` com o mesmo passo

### Requirement: Reconciliacao nao roda duas vezes
A reconciliacao de armazenamento de um usuario SHALL ter no maximo uma execucao em voo.

#### Scenario: Requisicoes simultaneas
- **WHEN** duas chamadas a `GET /api/me/entitlements` chegam com a janela vencida
- **THEN** uma varre e a outra devolve o contador sem varrer

### Requirement: Multi-processo so com storage compartilhado declarado
Com mais de um processo ou replica, o servidor SHALL exigir storage de midia compartilhado declarado e recusar capacidades exclusivas de um processo.

#### Scenario: Cluster sem S3
- **WHEN** `CLUSTER_WORKERS=2` e nenhum `S3_*` nem volume compartilhado declarado
- **THEN** o boot falha com mensagem que nomeia o que falta

### Requirement: Toda variavel de ambiente e declarada
Toda leitura de `process.env` no servidor SHALL corresponder a uma entrada do inventario de configuracao, e o CI SHALL provar.

#### Scenario: Variavel nova lida sem declarar
- **WHEN** um modulo passa a ler `process.env.NOVA`
- **THEN** o teste de inventario falha citando `NOVA` e o arquivo

