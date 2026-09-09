## Why

A Fase 0 mediu: 0 arquivos sem uso, 0 dependencias sem uso, 0 ciclos — os tres ja sao portao no `ci.yml`. Sobraram 16 exports, 15 tipos e 2 exports duplicados (named + default), que o CI NAO cobra por decisao escrita: re-export de barril produz falso positivo. A pergunta desta change e qual desses 33 e mesmo morto e qual e ruido de barril.

## What Changes

- Verificacao item a item: `grep` do nome em TODO o repositorio (inclusive strings, `.mjs`, `.md`, workers e o espelho anonimo), nao so no grafo de import.
- Remove o que nao aparece em lugar nenhum. Mantem o que e re-export de barril, com o consumidor real anotado.
- Onde o mesmo nome esta declarado em DOIS arquivos e os consumidores usam o outro, a copia sem consumidor sai; se as duas divergem, ficam as duas e o caso vira ADR da Fase 3.
- Bateria completa depois de cada remocao.

## Nao-escopo

Consolidar duplicata (isso e Fase 3, com ADR), mover arquivo (Fase 3) e corrigir comportamento (Fase 4). Aqui so sai o que nao tem consumidor, com prova.
