### A/B dos parciais (v1b) — A=atual.desktop (11 rodadas) × B=v1b-cauda-decode.desktop (11 rodadas)

Bootstrap pareado por fala de 10000 reamostragens, semente 20261121, IC 95%.

| métrica                                        | A     | B     | B − A  | IC 95% da diferença        | falas |
| ---------------------------------------------- | ----- | ----- | ------ | -------------------------- | ----- |
| atraso por palavra, original, p50 (ms)         | 1164  | 263   | −901   | [−1204, −717]              | 6     |
| atraso por palavra, original, p90 (ms)         | 2753  | 2276  | −477   | [−1615, −361]              | 6     |
| atraso por palavra, tradução (proxy), p50 (ms) | 2129  | 1009  | −1120  | [−1571, −231]              | 6     |
| atraso por palavra, tradução (proxy), p90 (ms) | 4016  | 3919  | −97    | [−769, +40]                | 6     |
| erasure do original                            | 0.659 | 2.253 | +1.594 | [+0.905, +2.283]           | 8     |
| erasure da tradução (proxy)                    | 0.508 | 2.023 | +1.516 | [+0.851, +2.152]           | 8     |
| fimDaFalaAteLegendaMs p75 (ms)                 | 1015  | 968   | −47    | [−222, +7]                 |       |
| 1º texto na tela (mediana das rodadas, ms)     | 3255  | 1631  | −1624  | (sem IC: medida de rodada) |       |

Guardas do SLO (mediana das rodadas válidas):

| guarda                            | A      | B       | limite  | situação   |
| --------------------------------- | ------ | ------- | ------- | ---------- |
| framesLongos.n50                  | 0      | 0       | 5       | ok         |
| framesLongos.n100                 | 0      | 0       | 3       | ok         |
| framesLongos.somaMs               | 0      | 0       | 500     | ok         |
| cpuSilencio.processoPct           | 14.457 | 14.647  | 25.24   | ok         |
| rendersPorS.silencio              | 22.919 | 22.919  | 31.649  | ok         |
| rendersPorS.fala                  | 94.452 | 167.642 | 128.065 | **piorou** |
| fimDaFalaAteLegendaMs.taxaDeFalha | 0      | 0       | 0.15    | ok         |

Primária (atraso do original p50): efeito −77.4% sobre A; IC inteiro abaixo de 0 e efeito >= 20%.

| guarda                                               | situação     | detalhe                                                                                                                 |
| ---------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------- |
| fimDaFalaAteLegendaMs p75                            | ok           | dif -47 ms, IC 95% [-222, 7], limite superior ≤ 30 ms                                                                   |
| erasureOriginal (Emenda 1: não piorar contra A)      | **reprovou** | dif 1.594, IC 95% [0.905, 2.283], limite superior ≤ 0.050                                                               |
| WER pareado do texto final (limite superior ≤ +2 pp) | ok           | dif −0.7 pp, IC 95% [−2.0 pp, +0.4 pp], limite superior ≤ +2.0 pp                                                       |
| texto final fora do conjunto de A (informativo)      | ok           | 4 de 88 textos de B fora do conjunto de A (normalizado: 4); WER A 21.7%, B 21.0%; falas em que A varia entre rodadas: 6 |
| SLO framesLongos.n50                                 | ok           | A 0, B 0, limite 5                                                                                                      |
| SLO framesLongos.n100                                | ok           | A 0, B 0, limite 3                                                                                                      |
| SLO framesLongos.somaMs                              | ok           | A 0, B 0, limite 500                                                                                                    |
| SLO cpuSilencio.processoPct                          | ok           | A 14.457, B 14.647, limite 25.24                                                                                        |
| SLO rendersPorS.silencio                             | ok           | A 22.919, B 22.919, limite 31.649                                                                                       |
| SLO rendersPorS.fala                                 | **reprovou** | A 94.452, B 167.642, limite 128.065                                                                                     |
| SLO fimDaFalaAteLegendaMs.taxaDeFalha                | ok           | A 0, B 0, limite 0.15                                                                                                   |

**Veredito: REPROVADO** (guardas reprovadas: erasureOriginal (Emenda 1: não piorar contra A); SLO rendersPorS.fala)
