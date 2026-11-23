### A/B dos parciais (v1c) — A=atual.desktop (11 rodadas) × B=v1c-acrescenta-decode.desktop (11 rodadas)

Bootstrap pareado por fala de 10000 reamostragens, semente 20261121, IC 95%.

| métrica                                        | A     | B     | B − A  | IC 95% da diferença        | falas |
| ---------------------------------------------- | ----- | ----- | ------ | -------------------------- | ----- |
| atraso por palavra, original, p50 (ms)         | 1280  | 1876  | +596   | [−292, +1127]              | 6     |
| atraso por palavra, original, p90 (ms)         | 2757  | 3478  | +722   | [+25, +1114]               | 6     |
| atraso por palavra, tradução (proxy), p50 (ms) | 2249  | 2519  | +270   | [+2, +719]                 | 6     |
| atraso por palavra, tradução (proxy), p90 (ms) | 4015  | 4012  | −3     | [−115, +182]               | 6     |
| erasure do original                            | 0.632 | 0.376 | −0.255 | [−0.492, +0.019]           | 8     |
| erasure da tradução (proxy)                    | 0.506 | 0.400 | −0.106 | [−0.333, +0.145]           | 8     |
| fimDaFalaAteLegendaMs p75 (ms)                 | 1022  | 964   | −58    | [−178, +4]                 |       |
| 1º texto na tela (mediana das rodadas, ms)     | 3203  | 1430  | −1773  | (sem IC: medida de rodada) |       |

Guardas do SLO (mediana das rodadas válidas):

| guarda                            | A      | B       | limite | situação |
| --------------------------------- | ------ | ------- | ------ | -------- |
| framesLongos.n50                  | 0      | 0       | 5      | ok       |
| framesLongos.n100                 | 0      | 0       | 3      | ok       |
| framesLongos.somaMs               | 0      | 0       | 500    | ok       |
| cpuSilencio.processoPct           | 13.574 | 13.325  | 24.004 | ok       |
| rendersPorS.silencio              | 22.919 | 22.919  | 31.649 | ok       |
| rendersPorS.fala                  | 91.656 | 110.988 | 124.57 | ok       |
| fimDaFalaAteLegendaMs.taxaDeFalha | 0      | 0       | 0.15   | ok       |

Primária (atraso do original p50): efeito +46.6% sobre A; IC cruza 0 ou efeito < 20%.

| guarda                                               | situação | detalhe                                                                                                                 |
| ---------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------- |
| fimDaFalaAteLegendaMs p75                            | ok       | dif -58 ms, IC 95% [-177, 4], limite superior ≤ 30 ms                                                                   |
| erasureOriginal (Emenda 1: não piorar contra A)      | ok       | dif -0.255, IC 95% [-0.492, 0.019], limite superior ≤ 0.050                                                             |
| WER pareado do texto final (limite superior ≤ +2 pp) | ok       | dif −0.5 pp, IC 95% [−2.5 pp, +0.8 pp], limite superior ≤ +2.0 pp                                                       |
| texto final fora do conjunto de A (informativo)      | ok       | 3 de 88 textos de B fora do conjunto de A (normalizado: 3); WER A 20.7%, B 20.3%; falas em que A varia entre rodadas: 5 |
| SLO framesLongos.n50                                 | ok       | A 0, B 0, limite 5                                                                                                      |
| SLO framesLongos.n100                                | ok       | A 0, B 0, limite 3                                                                                                      |
| SLO framesLongos.somaMs                              | ok       | A 0, B 0, limite 500                                                                                                    |
| SLO cpuSilencio.processoPct                          | ok       | A 13.574, B 13.325, limite 24.004                                                                                       |
| SLO rendersPorS.silencio                             | ok       | A 22.919, B 22.919, limite 31.649                                                                                       |
| SLO rendersPorS.fala                                 | ok       | A 91.656, B 110.988, limite 124.57                                                                                      |
| SLO fimDaFalaAteLegendaMs.taxaDeFalha                | ok       | A 0, B 0, limite 0.15                                                                                                   |

**Veredito: SEM DIFERENÇA PROVADA**
