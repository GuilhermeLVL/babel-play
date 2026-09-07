## Why

O seletor facetado foi implementado nas duas pontas e nao se falam: `Play.tsx:1626` monta `PedidoDeComposicao.filtro`, `composicao.ts:182` o tipa, o servidor o valida (`server/validation.ts:356-411`) e o aplica (`repositories/vocab.ts:563-619`), mas `caminhoDaComposicao` (`src/core/minigames/composicao.ts:348-361`) nunca serializa `filtro` na query. Verificado por execucao: com `filtro` na query o servidor filtra (15 itens de um baralho contra 60 sem filtro, 24 ms); sem ele, o filtro so acontece no fallback local (`composicao.ts:309-312`), que e o unico caminho no modo anonimo. Achado A17 de `openspec/audits/2026-09-07-coerencia.md`. A change `seletor-facetado` esta marcada concluida.

## What Changes

- `caminhoDaComposicao` serializa `filtro` (JSON compacto na query, com teto de tamanho; acima do teto, POST) e remove `fonte/fonteRef/lang` quando `filtro` esta presente (o servidor ja da precedencia).
- Teste de integracao que chama `compor` com `filtro` contra o Express (harness efemero de banco) e prova que o ramo facetado do repositorio foi executado (contagem menor e `proveniencia.origem` coerente).
- O fallback local continua existindo para o modo anonimo (ate `modo-anonimo-em-paridade` espelhar `para-jogo`), mas passa a ser registrado como fallback, nao como caminho normal.

## Capabilities

### Modified Capabilities
- `filtro-facetado` (change `seletor-facetado`): o requirement de paridade SQL x predicado passa a incluir "o cliente envia o filtro ao servidor".

## Impact

- `src/core/minigames/composicao.ts` (`caminhoDaComposicao`, `compor`), `server/validation.ts` (teto), `tests/composicaoDeRodada.test.ts`, `tests/integration/filtro-composicao.test.ts`
- Remove: nada.

## Pronto quando

`tests/integration/filtro-composicao.test.ts` prova que `compor({filtro})` gera uma requisicao com `filtro` e que a resposta reflete o filtro; `tests/composicaoDeRodada.test.ts` cobre o teto de tamanho e a precedencia sobre `fonte/lang`.

## Dependencias e paralelismo

Depende de `linha-de-base-verde`. Pequena; fazer antes de `jogos-culturais-dentro-do-sistema` (ambas tocam `Play.tsx`/`composicao.ts`). Paralelizavel com todas as outras.
