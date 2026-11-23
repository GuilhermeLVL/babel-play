### A/B dos parciais (v1c) — A=atual.fraco (11 rodadas) × B=v1c-acrescenta-token.fraco (11 rodadas)

Bootstrap pareado por fala de 10000 reamostragens, semente 20261121, IC 95%.

| métrica                                        | A     | B     | B − A  | IC 95% da diferença        | falas |
| ---------------------------------------------- | ----- | ----- | ------ | -------------------------- | ----- |
| atraso por palavra, original, p50 (ms)         | 1540  | 1957  | +417   | [+129, +675]               | 6     |
| atraso por palavra, original, p90 (ms)         | 3681  | 3803  | +121   | [−10, +633]                | 6     |
| atraso por palavra, tradução (proxy), p50 (ms) | 2457  | 2679  | +222   | [−30, +483]                | 6     |
| atraso por palavra, tradução (proxy), p90 (ms) | 4293  | 4299  | +6     | [−45, +116]                | 6     |
| erasure do original                            | 0.489 | 0.391 | −0.098 | [−0.166, −0.005]           | 8     |
| erasure da tradução (proxy)                    | 0.459 | 0.335 | −0.124 | [−0.241, −0.027]           | 8     |
| fimDaFalaAteLegendaMs p75 (ms)                 | 1230  | 1229  | −1     | [−41, +44]                 |       |
| 1º texto na tela (mediana das rodadas, ms)     | 1928  | 1928  | 0      | (sem IC: medida de rodada) |       |

Guardas do SLO (mediana das rodadas válidas):

| guarda                            | A       | B       | limite  | situação |
| --------------------------------- | ------- | ------- | ------- | -------- |
| framesLongos.n50                  | 0       | 0       | 5       | ok       |
| framesLongos.n100                 | 0       | 0       | 3       | ok       |
| framesLongos.somaMs               | 0       | 0       | 500     | ok       |
| cpuSilencio.processoPct           | 14.307  | 14.329  | 25.03   | ok       |
| rendersPorS.silencio              | 27.168  | 27.162  | 36.96   | ok       |
| rendersPorS.fala                  | 101.474 | 101.062 | 136.842 | ok       |
| fimDaFalaAteLegendaMs.taxaDeFalha | 0       | 0       | 0.15    | ok       |

Primária (atraso do original p50): efeito +27.0% sobre A; IC inteiro ACIMA de 0 (pior).

| guarda                                               | situação     | detalhe                                                                                                                 |
| ---------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------- |
| fimDaFalaAteLegendaMs p75                            | **reprovou** | dif -1 ms, IC 95% [-41, 44], limite superior ≤ 30 ms                                                                    |
| erasureOriginal (Emenda 1: não piorar contra A)      | ok           | dif -0.098, IC 95% [-0.166, -0.005], limite superior ≤ 0.050                                                            |
| WER pareado do texto final (limite superior ≤ +2 pp) | ok           | dif −0.2 pp, IC 95% [−1.8 pp, +1.2 pp], limite superior ≤ +2.0 pp                                                       |
| texto final fora do conjunto de A (informativo)      | ok           | 1 de 88 textos de B fora do conjunto de A (normalizado: 1); WER A 21.3%, B 21.1%; falas em que A varia entre rodadas: 6 |
| SLO framesLongos.n50                                 | ok           | A 0, B 0, limite 5                                                                                                      |
| SLO framesLongos.n100                                | ok           | A 0, B 0, limite 3                                                                                                      |
| SLO framesLongos.somaMs                              | ok           | A 0, B 0, limite 500                                                                                                    |
| SLO cpuSilencio.processoPct                          | ok           | A 14.307, B 14.329, limite 25.03                                                                                        |
| SLO rendersPorS.silencio                             | ok           | A 27.168, B 27.162, limite 36.96                                                                                        |
| SLO rendersPorS.fala                                 | ok           | A 101.474, B 101.062, limite 136.842                                                                                    |
| SLO fimDaFalaAteLegendaMs.taxaDeFalha                | ok           | A 0, B 0, limite 0.15                                                                                                   |

**Veredito: REPROVADO** (guardas reprovadas: fimDaFalaAteLegendaMs p75)
