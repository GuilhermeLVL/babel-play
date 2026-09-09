## Why

So existia `/api/health`, e o `Dockerfile` e o `docker-compose` o usavam como healthcheck. Sao duas
perguntas diferentes: "estou vivo" leva a REINICIAR, "consigo atender" leva a TIRAR DO
BALANCEADOR. Apontar o healthcheck para o health devolvia 200 numa instancia que subiu com o banco
na versao anterior.

## What Changes

- `/api/ready`: migracoes aplicadas, `SELECT 1` numa tabela real, e o armazenamento externo quando
  configurado. 200 pronto, 503 nao.
- `sondar()` no seam de armazenamento, porque `tamanho()` devolve `null` tanto para 404 quanto para
  403 — um ready sobre ele diria "pronto" para quem nao grava midia nenhuma.
- Dockerfile e compose apontam para o ready.

## Nao-escopo

Provedores de IA no ready. Um terceiro instavel tiraria todas as replicas do balanceador ao mesmo
tempo.
