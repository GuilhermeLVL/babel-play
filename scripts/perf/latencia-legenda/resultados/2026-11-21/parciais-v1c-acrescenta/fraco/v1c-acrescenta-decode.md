### A/B dos parciais (v1c) — A=atual.fraco (11 rodadas) × B=v1c-acrescenta-decode.fraco (11 rodadas)

Bootstrap pareado por fala de 10000 reamostragens, semente 20261121, IC 95%.

| métrica                                        | A     | B     | B − A  | IC 95% da diferença        | falas |
| ---------------------------------------------- | ----- | ----- | ------ | -------------------------- | ----- |
| atraso por palavra, original, p50 (ms)         | 1540  | 1953  | +413   | [+136, +665]               | 6     |
| atraso por palavra, original, p90 (ms)         | 3681  | 3714  | +32    | [−60, +625]                | 6     |
| atraso por palavra, tradução (proxy), p50 (ms) | 2457  | 2727  | +270   | [−13, +535]                | 6     |
| atraso por palavra, tradução (proxy), p90 (ms) | 4293  | 4276  | −18    | [−57, +90]                 | 6     |
| erasure do original                            | 0.489 | 0.353 | −0.135 | [−0.186, −0.080]           | 8     |
| erasure da tradução (proxy)                    | 0.459 | 0.323 | −0.137 | [−0.238, −0.060]           | 8     |
| fimDaFalaAteLegendaMs p75 (ms)                 | 1230  | 1223  | −7     | [−37, +35]                 |       |
| 1º texto na tela (mediana das rodadas, ms)     | 1928  | 1928  | 0      | (sem IC: medida de rodada) |       |

Guardas do SLO (mediana das rodadas válidas):

| guarda                            | A       | B      | limite  | situação |
| --------------------------------- | ------- | ------ | ------- | -------- |
| framesLongos.n50                  | 0       | 0      | 5       | ok       |
| framesLongos.n100                 | 0       | 0      | 3       | ok       |
| framesLongos.somaMs               | 0       | 0      | 500     | ok       |
| cpuSilencio.processoPct           | 14.307  | 14.592 | 25.03   | ok       |
| rendersPorS.silencio              | 27.168  | 27.17  | 36.96   | ok       |
| rendersPorS.fala                  | 101.474 | 100.78 | 136.842 | ok       |
| fimDaFalaAteLegendaMs.taxaDeFalha | 0       | 0      | 0.15    | ok       |

Primária (atraso do original p50): efeito +26.8% sobre A; IC inteiro ACIMA de 0 (pior).

| guarda                                               | situação     | detalhe                                                                                                                 |
| ---------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------- |
| fimDaFalaAteLegendaMs p75                            | **reprovou** | dif -7 ms, IC 95% [-37, 35], limite superior ≤ 30 ms                                                                    |
| erasureOriginal (Emenda 1: não piorar contra A)      | ok           | dif -0.135, IC 95% [-0.186, -0.080], limite superior ≤ 0.050                                                            |
| WER pareado do texto final (limite superior ≤ +2 pp) | **reprovou** | dif +0.3 pp, IC 95% [−1.1 pp, +2.0 pp], limite superior ≤ +2.0 pp                                                       |
| texto final fora do conjunto de A (informativo)      | ok           | 1 de 88 textos de B fora do conjunto de A (normalizado: 1); WER A 21.3%, B 21.6%; falas em que A varia entre rodadas: 6 |
| SLO framesLongos.n50                                 | ok           | A 0, B 0, limite 5                                                                                                      |
| SLO framesLongos.n100                                | ok           | A 0, B 0, limite 3                                                                                                      |
| SLO framesLongos.somaMs                              | ok           | A 0, B 0, limite 500                                                                                                    |
| SLO cpuSilencio.processoPct                          | ok           | A 14.307, B 14.592, limite 25.03                                                                                        |
| SLO rendersPorS.silencio                             | ok           | A 27.168, B 27.17, limite 36.96                                                                                         |
| SLO rendersPorS.fala                                 | ok           | A 101.474, B 100.78, limite 136.842                                                                                     |
| SLO fimDaFalaAteLegendaMs.taxaDeFalha                | ok           | A 0, B 0, limite 0.15                                                                                                   |

**Veredito: REPROVADO** (guardas reprovadas: fimDaFalaAteLegendaMs p75; WER pareado do texto final (limite superior ≤ +2 pp))
