## Why

Duas rotas dominavam a baseline de latencia: `GET /api/vocab` (p50 991 ms) e
`GET /api/metrics/profile` (p50 354 ms). A leitura facil — falta indice, falta paginacao — foi
conferida e recusada: `EXPLAIN QUERY PLAN` mostra que todas as consultas usam indice, e o banco
real e pequeno.

## What Changes

- `GET /api/vocab` para de mandar seis colunas sem leitor: 18,3% do corpo cru, 10,2% depois do
  gzip. `user_id` e `deleted_at` sao contabilidade interna e nunca deveriam ter saido.
- `GET /api/exercises/results` ganha teto. Ela nao tinha nenhum: com 20 mil linhas devolvia 3,85 MB
  por chamada, e o `?limite=` que os scripts ja mandavam era descartado pelo `.strip()`.

## Nao-escopo

`computeProfile`. Medido isoladamente ele custa 41,8 ms; os 371 ms do HTTP com 10 conexoes sao
fila num processo so. Reduzir os 41,8 ms exige reestruturar a funcao que alimenta varias telas, e
isso vai para o relatorio como o proximo passo, com o numero medido.
