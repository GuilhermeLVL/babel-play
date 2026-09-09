## ADDED Requirements

### Requirement: O diario nao guarda conteudo do usuario

Nenhuma linha de log SHALL conter valores vinculados de consulta, e-mail ou segredo, mesmo quando o
erro de origem os carrega.

#### Scenario: Escrita falha com texto do usuario

- **WHEN** uma escrita pelo ORM falha e a mensagem do erro traz os parametros vinculados
- **THEN** a linha de log traz a consulta e os quadros do stack, e nao os valores

#### Scenario: Uma linha por evento

- **WHEN** um erro nao tratado chega ao handler global em producao
- **THEN** sai uma unica linha JSON, com o stack redigido dentro dela
