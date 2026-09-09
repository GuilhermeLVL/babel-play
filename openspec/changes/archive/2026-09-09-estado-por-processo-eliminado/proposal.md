## Why

`erros.ts` guardava a quota num `Map`: o teto valia por processo, entao era "10 x numero de
instancias". `images.ts` guardava um cache em memoria, sem validade.

## What Changes

- O teto de erros passa ao `createDbRateLimitStore`, com balde proprio.
- O cache de imagens foi REMOVIDO, por medicao: com o teto de 200 que existia, 20 acertos em 916
  buscas (2,2%).

## Nao-escopo

Levar o cache ao banco. Trocaria rede por disco em 100% das buscas para servir 2% delas.
