### A/B dos parciais (v1b) — A=antes.desktop (12 rodadas) × B=depois.desktop (12 rodadas)

Bootstrap pareado por fala de 10000 reamostragens, semente 20261121, IC 95%.

| métrica | A | B | B − A | IC 95% da diferença | falas |
|---|---|---|---|---|---|
| atraso por palavra, original, p50 (ms) | 2661 | 2642 | −19 | [−49, +56] | 14 |
| atraso por palavra, original, p90 (ms) | 4410 | 4418 | +8 | [−43, +73] | 14 |
| atraso por palavra, tradução (proxy), p50 (ms) | — | — | — | — | 0 |
| atraso por palavra, tradução (proxy), p90 (ms) | — | — | — | — | 0 |
| erasure do original | 0.000 | 0.000 | 0.000 | [0.000, 0.000] | 16 |
| erasure da tradução (proxy) | undefined | undefined | — | — | 0 |
| fimDaFalaAteLegendaMs p75 | — | — | — | — | |
| fimDaFalaAteOriginalMs p75 (ms) | 921 | 939 | +18 | [−74, +65] | |
| 1º texto na tela (mediana das rodadas, ms) | 6373 | 6333 | −40 | (sem IC: medida de rodada) | |

Guardas do SLO (mediana das rodadas válidas):

| guarda | A | B | limite | situação |
|---|---|---|---|---|
| framesLongos.n50 | 0 | 0 | 5 | ok |
| framesLongos.n100 | 0 | 0 | 3 | ok |
| framesLongos.somaMs | 0 | 0 | 500 | ok |
| cpuSilencio.processoPct | 12.727 | 12.782 | 22.818 | ok |
| rendersPorS.silencio | 22.839 | 22.839 | 31.548 | ok |
| rendersPorS.fala | 57.869 | 58.212 | 82.337 | ok |
| fimDaFalaAteLegendaMs.taxaDeFalha | — | — | — | sem-medida |

Primária (atraso do original p50): efeito −0.7% sobre A; IC cruza 0 ou efeito < 20%.

| guarda | situação | detalhe |
|---|---|---|
| fimDaFalaAteOriginalMs p75 (guarda 1 sem tradução) | ok | dif 18 ms, IC 95% [-73, 65], limite superior ≤ 100 ms |
| erasureOriginal (Emenda 1: não piorar contra A) | ok | dif 0.000, IC 95% [0.000, 0.000], limite superior ≤ 0.050 |
| WER pareado do texto final (limite superior ≤ +2 pp) | ok | dif +0.3 pp, IC 95% [−0.5 pp, +1.0 pp], limite superior ≤ +2.0 pp |
| texto final fora do conjunto de A (informativo) | ok | 8 de 192 textos de B fora do conjunto de A (normalizado: 4); WER A 2.5%, B 2.7%; falas em que A varia entre rodadas: 7 |
| SLO framesLongos.n50 | ok | A 0, B 0, limite 5 |
| SLO framesLongos.n100 | ok | A 0, B 0, limite 3 |
| SLO framesLongos.somaMs | ok | A 0, B 0, limite 500 |
| SLO cpuSilencio.processoPct | ok | A 12.727, B 12.782, limite 22.818 |
| SLO rendersPorS.silencio | ok | A 22.839, B 22.839, limite 31.548 |
| SLO rendersPorS.fala | ok | A 57.869, B 58.212, limite 82.337 |
| SLO fimDaFalaAteLegendaMs.taxaDeFalha | sem-medida | A —, B —, limite — |

**Veredito: SEM DIFERENÇA PROVADA**
