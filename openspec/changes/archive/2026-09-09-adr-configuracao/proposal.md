## Why

O plano previa schema Zod para as 60 leituras de `process.env`. Das 60, zero estavam fora do
inventario.

## What Changes

- ADR 0005 registra por que o desenho atual fica, e a divida que aceita (sem coercao de tipo).
- `VARIAVEIS_POR_PLANO` gerada da `PLAN_MATRIX`; a regra `env-fora-de-config` cobre `process.env[$X]`.

## Nao-escopo

Mover arquivo de lugar (a movimentacao por dominio e change propria) e mudar comportamento.
