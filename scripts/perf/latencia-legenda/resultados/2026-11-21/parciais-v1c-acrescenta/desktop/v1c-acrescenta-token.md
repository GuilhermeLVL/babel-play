### A/B dos parciais (v1c) — A=atual.desktop (11 rodadas) × B=v1c-acrescenta-token.desktop (11 rodadas)

Bootstrap pareado por fala de 10000 reamostragens, semente 20261121, IC 95%.

| métrica                                        | A     | B     | B − A  | IC 95% da diferença        | falas |
| ---------------------------------------------- | ----- | ----- | ------ | -------------------------- | ----- |
| atraso por palavra, original, p50 (ms)         | 1280  | 1956  | +676   | [+74, +1170]               | 6     |
| atraso por palavra, original, p90 (ms)         | 2757  | 3511  | +754   | [+31, +1130]               | 6     |
| atraso por palavra, tradução (proxy), p50 (ms) | 2249  | 2507  | +258   | [0, +645]                  | 6     |
| atraso por palavra, tradução (proxy), p90 (ms) | 4015  | 4019  | +4     | [−106, +212]               | 6     |
| erasure do original                            | 0.632 | 0.470 | −0.162 | [−0.453, +0.220]           | 8     |
| erasure da tradução (proxy)                    | 0.506 | 0.325 | −0.181 | [−0.386, +0.071]           | 8     |
| fimDaFalaAteLegendaMs p75 (ms)                 | 1022  | 976   | −46    | [−175, +8]                 |       |
| 1º texto na tela (mediana das rodadas, ms)     | 3203  | 1428  | −1775  | (sem IC: medida de rodada) |       |

Guardas do SLO (mediana das rodadas válidas):

| guarda                            | A      | B       | limite | situação   |
| --------------------------------- | ------ | ------- | ------ | ---------- |
| framesLongos.n50                  | 0      | 0       | 5      | ok         |
| framesLongos.n100                 | 0      | 0       | 3      | ok         |
| framesLongos.somaMs               | 0      | 0       | 500    | ok         |
| cpuSilencio.processoPct           | 13.574 | 13.401  | 24.004 | ok         |
| rendersPorS.silencio              | 22.919 | 22.919  | 31.649 | ok         |
| rendersPorS.fala                  | 91.656 | 128.739 | 124.57 | **piorou** |
| fimDaFalaAteLegendaMs.taxaDeFalha | 0      | 0       | 0.15   | ok         |

Primária (atraso do original p50): efeito +52.8% sobre A; IC inteiro ACIMA de 0 (pior).

| guarda                                               | situação     | detalhe                                                                                                                 |
| ---------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------- |
| fimDaFalaAteLegendaMs p75                            | ok           | dif -45 ms, IC 95% [-175, 8], limite superior ≤ 30 ms                                                                   |
| erasureOriginal (Emenda 1: não piorar contra A)      | **reprovou** | dif -0.162, IC 95% [-0.453, 0.220], limite superior ≤ 0.050                                                             |
| WER pareado do texto final (limite superior ≤ +2 pp) | ok           | dif −0.1 pp, IC 95% [−1.4 pp, +1.2 pp], limite superior ≤ +2.0 pp                                                       |
| texto final fora do conjunto de A (informativo)      | ok           | 2 de 88 textos de B fora do conjunto de A (normalizado: 2); WER A 20.7%, B 20.6%; falas em que A varia entre rodadas: 5 |
| SLO framesLongos.n50                                 | ok           | A 0, B 0, limite 5                                                                                                      |
| SLO framesLongos.n100                                | ok           | A 0, B 0, limite 3                                                                                                      |
| SLO framesLongos.somaMs                              | ok           | A 0, B 0, limite 500                                                                                                    |
| SLO cpuSilencio.processoPct                          | ok           | A 13.574, B 13.401, limite 24.004                                                                                       |
| SLO rendersPorS.silencio                             | ok           | A 22.919, B 22.919, limite 31.649                                                                                       |
| SLO rendersPorS.fala                                 | **reprovou** | A 91.656, B 128.739, limite 124.57                                                                                      |
| SLO fimDaFalaAteLegendaMs.taxaDeFalha                | ok           | A 0, B 0, limite 0.15                                                                                                   |

**Veredito: REPROVADO** (guardas reprovadas: erasureOriginal (Emenda 1: não piorar contra A); SLO rendersPorS.fala)
