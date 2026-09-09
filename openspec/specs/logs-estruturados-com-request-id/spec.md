# logs-estruturados-com-request-id Specification

## Purpose

TBD - created by archiving change logs-estruturados-com-request-id. Update Purpose after archive.

## Requirements

### Requirement: Toda linha de log dentro de um request carrega o id dele

O logger SHALL preencher `requestId` sozinho quando a chamada acontecer dentro do ciclo de um
request, sem exigir que o chamador o passe.

#### Scenario: Funcao de dominio sem acesso ao Request

- **WHEN** uma funcao chamada durante um request registra um evento sem passar `requestId`
- **THEN** a linha sai com o id daquele request

#### Scenario: Dois requests ao mesmo tempo

- **WHEN** dois requests estao em voo simultaneamente
- **THEN** cada linha carrega o id do seu proprio request
