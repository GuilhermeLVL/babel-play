# eval-traducao-lab-v1 — a tradução nesta cópia (produção)

Esta cópia (`babel-play-lab`, a que vai para produção) tinha **metade** da correção: o `GERACAO`
com `num_beams: 2` no `mtWorker.ts`, que a cópia de engenharia não tem. A outra metade — segmentar
em frases antes de traduzir — só existia lá. Este documento mede as duas, separadas e juntas.

Reproduzir:

```bash
node node_modules/tsx/dist/cli.mjs scripts/eval-fala/medir-traducao.mjs              # com segmentação
node node_modules/tsx/dist/cli.mjs scripts/eval-fala/medir-traducao.mjs --frase-unica  # sem
```

O runner espelha o `GERACAO` real de `src/gateway/adapters/mtWorker.ts` — **beam 2, não greedy**.
Um harness que decodificasse diferente mediria outro produto.

## Resultado — `opus-mt` local, en→pt, 16 casos

| Categoria | Beam 2 só (o lab antes) | Beam 2 + segmentação | Δ |
|---|---|---|---|
| **pronome** | 57,9% | **75,5%** | **+17,6** |
| **genero** | 56,0% | **71,5%** | **+15,5** |
| fala-espontanea | 55,7% | 55,7% | — |
| idiomatico | 27,4% | 27,4% | — |
| literal | 83,8% | 83,8% | — |
| registro | 32,1% | 32,1% | — |
| **geral** | 51,4% | **56,6%** | **+5,2** |

**O beam sozinho não conserta o truncamento.** 51,4% com beam 2 é exatamente o mesmo número da
cópia de engenharia com decodificação gulosa: o `num_beams` melhora a escolha de palavras dentro
de uma frase, mas não faz a segunda frase existir. O modelo emite o token de fim depois da
primeira sentença, e nenhum parâmetro de busca desfaz isso.

As categorias de frase única **não se movem um décimo**. O ganho aparece só onde os casos têm duas
frases — assinatura de correção causal, não de ruído.

## O que continua faltando

`she`/`he` da segunda frase ainda não alcança o substantivo da primeira ("Meu médico … Ela foi
muito gentil"), porque cada frase é traduzida isolada. Isso é a janela de contexto, e nesta cópia
ela **existe**: `MtOptions{falada, contexto}` no `gateway/index.ts` roteia fala para o
`server-llm-mt` com as 3 últimas falas. Segmentar era o pré-requisito — sem ela a segunda frase
nem chegava a existir para ser desambiguada.

O idiomático (27,4%) não se move e não devia: não depende de contexto, depende do modelo.
