# performance-servidor Specification

## Purpose

TBD - created by archiving change performance-servidor. Update Purpose after archive.

## Requirements

### Requirement: Rota de listagem nao devolve tabela inteira

Uma rota que lista sem filtro SHALL ter teto padrao de linhas.

#### Scenario: Tabela grande

- **WHEN** a tabela de resultados tem mais linhas que o teto e a rota e chamada sem filtro
- **THEN** a resposta traz no maximo o teto, das mais recentes

### Requirement: Contabilidade interna nao sai do servidor

Coluna que existe para o servidor se organizar — dono da linha, marca de remocao — SHALL ficar no
servidor, e nao viajar na resposta de uma rota de leitura.

#### Scenario: Listagem do baralho

- **WHEN** o cliente pede o baralho
- **THEN** a resposta nao traz `user_id` nem `deleted_at`
