# idor-negativo Specification

## Purpose

TBD - created by archiving change idor-negativo. Update Purpose after archive.

## Requirements

### Requirement: Recurso de um usuario e inalcancavel por outro

Toda rota privada com identificador no caminho SHALL responder 403 ou 404 para um usuario que nao
e dono do recurso, sem vazar conteudo e sem efeito sobre o recurso.

#### Scenario: B chama a rota com o id de A

- **WHEN** o usuario B chama uma rota privada com o identificador de um recurso de A, com corpo valido
- **THEN** a resposta nao contem dado de A, o recurso de A permanece inalterado, e a mesma chamada
  feita por A funciona

#### Scenario: Rota nova com parametro

- **WHEN** uma rota privada com `:id` e adicionada sem semeadura declarada
- **THEN** `tests/seguranca/idor.test.ts` falha
