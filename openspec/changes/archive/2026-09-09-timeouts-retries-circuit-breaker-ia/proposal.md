## Why

A medicao veio antes de acrescentar e mudou o escopo: timeout ja existe e e unico
(`llmClient.ts:107`, `sttProxy.ts:129`) e a cascata ja cobre fallback. Nao faltava timeout nem
fallback. Faltava MEMORIA entre requisicoes: com o primario caido, cada traducao pagava 12 s antes
de chegar a reserva.

## What Changes

- Disjuntor por `base·modelo`, 5 falhas seguidas, 30 s aberto, meio-aberto com uma sondagem. 413
  nao conta: e o nosso teto de prompt, antes de qualquer socket.
- Retry so no STT, que nao tem cascata, e so em 429 e 5xx.

## Nao-escopo

Retry em timeout — o timeout e o NOSSO `AbortSignal`, e a requisicao pode estar sendo processada e
cobrada naquele momento. E `opossum`, que envolve promessa que rejeita, enquanto `chamarChat`
devolve `{ok,status,causa}` de proposito.
