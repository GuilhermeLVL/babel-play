## Why

Nao existia resposta verificavel para "quais rotas sao publicas e quais tem limitador". A primeira
tentativa de responder por regex sobre `server/routes/*.ts` deu falso positivo em serie: um handler
que delega a auxiliar (`deckDoUsuario`, `parseOr400`, `requireRole` importado) parece desprotegido
para quem le so o corpo, e um router montado duas vezes parece montado uma. Pior: o que decide se
uma rota e publica NAO esta no arquivo da rota, esta na ORDEM da montagem — o mesmo router antes do
`authMiddleware` e publico e depois dele e privado.

## What Changes

- `tests/seguranca/_matriz.ts` le `app._router.stack` DEPOIS de `criarApp()`: a pilha real, na
  ordem real, com os limitadores que foram realmente montados.
- `tests/seguranca/matriz-de-rotas.test.ts` cobra a classificacao das 85 rotas. Rota publica precisa
  estar numa allowlist com razao; escrita privada sem limitador derruba a suite.
- **Achado corrigido**: quatro escritas privadas sem limitador nenhum, todas em `/api/admin`.
  `/api/admin` e `/api/audio` entraram no `writeLimiter`.
- `TRUST_PROXY` declarada e aplicada quando definida, com os dois lados documentados.

## Nao-escopo

Mudar guarda de rota. A matriz descreve e cobra; onde ela achou furo, o furo foi fechado no mesmo
commit, sem redesenhar autorizacao.
