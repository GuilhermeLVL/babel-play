## Why

`latencia.mjs` mede uma rota por vez com 10 conexoes. Ele nao diz o que acontece quando cinquenta
pessoas fazem a jornada inteira ao mesmo tempo — que e onde a consulta cara de uma tela come o
orcamento das outras, e foi exatamente ali que apareceu o defeito de
`GET /api/exercises/results`.

## What Changes

- `scripts/perf/carga.k6.js`: jornada completa, 0 -> 20 -> 50 VUs, limiares por rota como CATRACA
  sobre tres corridas de copia limpa.
- `scripts/perf/concorrencia.mjs`: N gastos simultaneos em ondas, com conferencia do ledger.

## Nao-escopo

Limiar aspiracional. `p(95)<300ms` reprovava sempre, e limiar que reprova sempre e tao inutil
quanto o que aprova sempre. A meta fica escrita no arquivo.
