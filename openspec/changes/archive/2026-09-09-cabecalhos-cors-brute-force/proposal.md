## Why

A CSP so existia em producao, entao a primeira vez que alguem a via era quando ela ja estava
bloqueando. E os dois limitadores sao montados DEPOIS do `authMiddleware`, porque a chave deles e o
tenant: uma requisicao que termina em 401 nao chegava a limitador nenhum.

## What Changes

- CSP em modo `reportOnly` fora de producao, com as MESMAS diretivas.
- Limitador de 401 antes do auth, com balde proprio, contando so o que falhou
  (`skipSuccessfulRequests` + `requestWasSuccessful`). 30 por 15 minutos, so em modo publico.
- Prova negativa de CORS (nenhum `Access-Control-Allow-Origin` sai, nem no preflight) e de cookie (o
  servidor nao emite e um cookie enviado nao autentica) — e isso que sustenta "CSRF nao se aplica".
- Tres testes que liam `server/http/app.ts` como TEXTO com aspas duplas literais consertados: o
  prettier da Fase 3 mudou a aspa do arquivo e as tres regexes passaram a casar com zero.

## Nao-escopo

Adotar `cors()`. Nao ha middleware de CORS e o comportamento atual e o mais seguro; o teste existe
para que acrescenta-lo sem lista de origens caia.
