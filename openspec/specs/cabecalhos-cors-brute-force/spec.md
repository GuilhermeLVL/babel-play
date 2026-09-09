# cabecalhos-cors-brute-force Specification

## Purpose

TBD - created by archiving change cabecalhos-cors-brute-force. Update Purpose after archive.

## Requirements

### Requirement: Falha de autenticacao repetida encontra teto

Em modo publico o servidor SHALL limitar requisicoes que terminam em 401 por origem, sem que
requisicoes autenticadas consumam esse teto.

#### Scenario: Adivinhacao de token

- **WHEN** uma origem acumula mais de 30 respostas 401 em 15 minutos
- **THEN** as requisicoes seguintes daquela origem recebem 429

#### Scenario: Uso normal do produto

- **WHEN** um usuario autenticado faz dezenas de requisicoes
- **THEN** nenhuma e barrada por esse teto

### Requirement: Politica de conteudo visivel fora de producao

O servidor SHALL emitir a CSP tambem fora de producao, em modo relatorio, com as mesmas diretivas
que aplica em producao.

#### Scenario: Requisicao em desenvolvimento

- **WHEN** o servidor responde fora de producao
- **THEN** sai `Content-Security-Policy-Report-Only` com as diretivas de producao, e nao sai
  `Content-Security-Policy`
