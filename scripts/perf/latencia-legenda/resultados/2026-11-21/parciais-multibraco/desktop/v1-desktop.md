### A/B dos parciais (v1) — A=atual.desktop (12 rodadas) × B=v1.desktop (12 rodadas)

Bootstrap pareado por fala de 10000 reamostragens, semente 20261121, IC 95%.

| métrica                                        | A     | B     | B − A  | IC 95% da diferença        | falas |
| ---------------------------------------------- | ----- | ----- | ------ | -------------------------- | ----- |
| atraso por palavra, original, p50 (ms)         | 1265  | 255   | −1010  | [−1217, −854]              | 6     |
| atraso por palavra, original, p90 (ms)         | 2683  | 2334  | −348   | [−1526, +7]                | 6     |
| atraso por palavra, tradução (proxy), p50 (ms) | 2073  | 1290  | −783   | [−1276, −65]               | 6     |
| atraso por palavra, tradução (proxy), p90 (ms) | 4028  | 3931  | −96    | [−303, +137]               | 6     |
| erasure do original                            | 0.587 | 3.595 | +3.008 | [+2.609, +3.403]           | 8     |
| erasure da tradução (proxy)                    | 0.496 | 2.010 | +1.514 | [+0.894, +2.093]           | 8     |
| fimDaFalaAteLegendaMs p75 (ms)                 | 1016  | 853   | −163   | [−173, +4]                 |       |
| 1º texto na tela (mediana das rodadas, ms)     | 3194  | 1226  | −1968  | (sem IC: medida de rodada) |       |

Guardas do SLO (mediana das rodadas válidas):

| guarda                            | A      | B      | limite  | situação   |
| --------------------------------- | ------ | ------ | ------- | ---------- |
| framesLongos.n50                  | 0      | 0      | 5       | ok         |
| framesLongos.n100                 | 0      | 0      | 3       | ok         |
| framesLongos.somaMs               | 0      | 0      | 500     | ok         |
| cpuSilencio.processoPct           | 12.94  | 13.279 | 23.115  | ok         |
| rendersPorS.silencio              | 22.919 | 22.919 | 31.649  | ok         |
| rendersPorS.fala                  | 90.93  | 223.45 | 123.662 | **piorou** |
| fimDaFalaAteLegendaMs.taxaDeFalha | 0      | 0      | 0.15    | ok         |

Primária (atraso do original p50): efeito −79.8% sobre A; IC inteiro abaixo de 0 e efeito >= 20%.

| guarda                                          | situação     | detalhe                                                                                                                 |
| ----------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------- |
| fimDaFalaAteLegendaMs p75                       | **reprovou** | dif -163 ms, IC 95% [-173, 4], limite superior ≤ 0                                                                      |
| erasureOriginal (Emenda 1: não piorar contra A) | **reprovou** | dif 3.008, IC 95% [2.609, 3.403], limite superior ≤ 0.050                                                               |
| texto final do original                         | **reprovou** | 5 de 96 textos de B fora do conjunto de A (normalizado: 4); WER A 20.8%, B 20.7%; falas em que A varia entre rodadas: 5 |
| SLO framesLongos.n50                            | ok           | A 0, B 0, limite 5                                                                                                      |
| SLO framesLongos.n100                           | ok           | A 0, B 0, limite 3                                                                                                      |
| SLO framesLongos.somaMs                         | ok           | A 0, B 0, limite 500                                                                                                    |
| SLO cpuSilencio.processoPct                     | ok           | A 12.94, B 13.279, limite 23.115                                                                                        |
| SLO rendersPorS.silencio                        | ok           | A 22.919, B 22.919, limite 31.649                                                                                       |
| SLO rendersPorS.fala                            | **reprovou** | A 90.93, B 223.45, limite 123.662                                                                                       |
| SLO fimDaFalaAteLegendaMs.taxaDeFalha           | ok           | A 0, B 0, limite 0.15                                                                                                   |

**Veredito: REPROVADO** (guardas reprovadas: fimDaFalaAteLegendaMs p75; erasureOriginal (Emenda 1: não piorar contra A); texto final do original; SLO rendersPorS.fala)
