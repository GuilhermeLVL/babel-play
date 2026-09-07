## Why

O dono reportou "gráficos não plotados" em Minhas Palavras e na Sessão. A investigação (31/08)
mostrou que quase tudo é estado vazio HONESTO (0 revisões, 0 estabilidade, 0 CEFR), mas achou
4 defeitos reais que fazem a tela parecer quebrada ou mentir:

1. `Metrics.tsx:262-269` + `:580`: cartão novo cai só no balde "sem estabilidade" (a ordem dos
   testes decide), forçando "0 nunca foram revisados" quando o certo é o deck inteiro.
2. `Metrics.tsx:783-785`: template string com JSX literal — o usuário lê código na tela.
3. `Analysis.tsx:1953-1971`: "Topologia Lexical da Sessão" plota o deck INTEIRO, sem filtro.
4. `Analysis.tsx:942` + `audioDaSessao.ts:83-93`: MediaError code 4 por src vazio/blob revogado
   (StrictMode) vira toast "navegador não suporta o formato" — causa errada.

## What Changes

Os 4 consertos acima; nenhum estado vazio honesto é tocado.
