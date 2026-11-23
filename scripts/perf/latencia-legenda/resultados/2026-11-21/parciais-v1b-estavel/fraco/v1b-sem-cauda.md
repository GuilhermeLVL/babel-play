### A/B dos parciais (v1b) — A=atual.fraco (11 rodadas) × B=v1b-sem-cauda.fraco (11 rodadas)

Bootstrap pareado por fala de 10000 reamostragens, semente 20261121, IC 95%.

| métrica                                        | A     | B     | B − A  | IC 95% da diferença        | falas |
| ---------------------------------------------- | ----- | ----- | ------ | -------------------------- | ----- |
| atraso por palavra, original, p50 (ms)         | 1677  | 2804  | +1127  | [+463, +1523]              | 5     |
| atraso por palavra, original, p90 (ms)         | 3834  | 3926  | +91    | [+1, +1025]                | 5     |
| atraso por palavra, tradução (proxy), p50 (ms) | 2188  | 3001  | +813   | [+324, +1139]              | 5     |
| atraso por palavra, tradução (proxy), p90 (ms) | 4137  | 4323  | +186   | [+150, +355]               | 5     |
| erasure do original                            | 0.510 | 0.000 | −0.510 | [−0.683, −0.397]           | 7     |
| erasure da tradução (proxy)                    | 0.533 | 0.000 | −0.533 | [−0.727, −0.399]           | 7     |
| fimDaFalaAteLegendaMs p75 (ms)                 | 1226  | 1403  | +177   | [+22, +202]                |       |
| 1º texto na tela (mediana das rodadas, ms)     | 1922  | 4971  | +3049  | (sem IC: medida de rodada) |       |

Guardas do SLO (mediana das rodadas válidas):

| guarda                            | A       | B      | limite  | situação |
| --------------------------------- | ------- | ------ | ------- | -------- |
| framesLongos.n50                  | 0       | 0      | 5       | ok       |
| framesLongos.n100                 | 0       | 0      | 3       | ok       |
| framesLongos.somaMs               | 0       | 0      | 500     | ok       |
| cpuSilencio.processoPct           | 13.406  | 13.269 | 23.768  | ok       |
| rendersPorS.silencio              | 27.15   | 27.163 | 36.938  | ok       |
| rendersPorS.fala                  | 101.842 | 79.779 | 137.303 | ok       |
| fimDaFalaAteLegendaMs.taxaDeFalha | 0       | 0.011  | 0.15    | ok       |

Primária (atraso do original p50): efeito +67.2% sobre A; IC inteiro ACIMA de 0 (pior).

| guarda                                               | situação     | detalhe                                                                                                                 |
| ---------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------- |
| fimDaFalaAteLegendaMs p75                            | **reprovou** | dif 177 ms, IC 95% [22, 202], limite superior ≤ 30 ms                                                                   |
| erasureOriginal (Emenda 1: não piorar contra A)      | ok           | dif -0.510, IC 95% [-0.683, -0.397], limite superior ≤ 0.050                                                            |
| WER pareado do texto final (limite superior ≤ +2 pp) | ok           | dif +0.1 pp, IC 95% [−1.5 pp, +1.7 pp], limite superior ≤ +2.0 pp                                                       |
| texto final fora do conjunto de A (informativo)      | ok           | 5 de 88 textos de B fora do conjunto de A (normalizado: 5); WER A 21.0%, B 21.1%; falas em que A varia entre rodadas: 5 |
| SLO framesLongos.n50                                 | ok           | A 0, B 0, limite 5                                                                                                      |
| SLO framesLongos.n100                                | ok           | A 0, B 0, limite 3                                                                                                      |
| SLO framesLongos.somaMs                              | ok           | A 0, B 0, limite 500                                                                                                    |
| SLO cpuSilencio.processoPct                          | ok           | A 13.406, B 13.269, limite 23.768                                                                                       |
| SLO rendersPorS.silencio                             | ok           | A 27.15, B 27.163, limite 36.938                                                                                        |
| SLO rendersPorS.fala                                 | ok           | A 101.842, B 79.779, limite 137.303                                                                                     |
| SLO fimDaFalaAteLegendaMs.taxaDeFalha                | ok           | A 0, B 0.011, limite 0.15                                                                                               |

**Veredito: REPROVADO** (guardas reprovadas: fimDaFalaAteLegendaMs p75)
