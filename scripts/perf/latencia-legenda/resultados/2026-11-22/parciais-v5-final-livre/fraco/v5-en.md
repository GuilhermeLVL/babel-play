### A/B dos parciais (v4) — A=atual.fraco (11 rodadas) × B=v5-en.fraco (11 rodadas)

Bootstrap pareado por fala de 10000 reamostragens, semente 20261121, IC 95%.

| métrica                                        | A     | B     | B − A  | IC 95% da diferença        | falas |
| ---------------------------------------------- | ----- | ----- | ------ | -------------------------- | ----- |
| atraso por palavra, original, p50 (ms)         | 1774  | 1783  | +10    | [−151, +216]               | 6     |
| atraso por palavra, original, p90 (ms)         | 3832  | 3825  | −7     | [−613, +73]                | 6     |
| atraso por palavra, tradução (proxy), p50 (ms) | 2565  | 2717  | +152   | [−49, +435]                | 6     |
| atraso por palavra, tradução (proxy), p90 (ms) | 4238  | 4244  | +6     | [−45, +149]                | 6     |
| erasure do original                            | 0.532 | 0.448 | −0.083 | [−0.119, −0.047]           | 8     |
| erasure da tradução (proxy)                    | 0.479 | 0.409 | −0.070 | [−0.137, −0.005]           | 8     |
| fimDaFalaAteLegendaMs p75 (ms)                 | 1234  | 1209  | −25    | [−71, +16]                 |       |
| fimDaFalaAteOriginalMs p75 (ms)                | 1152  | 1149  | −2     | [−79, +15]                 |       |
| 1º texto na tela (mediana das rodadas, ms)     | 1909  | 1914  | +5     | (sem IC: medida de rodada) |       |

Guardas do SLO (mediana das rodadas válidas):

| guarda                            | A       | B       | limite  | situação |
| --------------------------------- | ------- | ------- | ------- | -------- |
| framesLongos.n50                  | 0       | 0       | 5       | ok       |
| framesLongos.n100                 | 0       | 0       | 3       | ok       |
| framesLongos.somaMs               | 0       | 0       | 500     | ok       |
| cpuSilencio.processoPct           | 13.625  | 13.735  | 24.076  | ok       |
| rendersPorS.silencio              | 27.135  | 27.204  | 36.918  | ok       |
| rendersPorS.fala                  | 102.514 | 102.471 | 138.143 | ok       |
| fimDaFalaAteLegendaMs.taxaDeFalha | 0       | 0       | 0.15    | ok       |

Primária (atraso do original p50): efeito +0.5% sobre A; IC cruza 0 ou efeito < 20%.

| guarda                                                                                   | situação | detalhe                                                                                                                 |
| ---------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------- |
| fimDaFalaAteLegendaMs p75                                                                | ok       | dif -25 ms, IC 95% [-70, 16], limite superior ≤ 30 ms                                                                   |
| erasureOriginal de B (V4: orçamento absoluto, média ≤ 0.5 e limite superior do IC ≤ 0.6) | ok       | B média 0.448, IC 95% de B [0.352, 0.587]; A 0.532, B − A -0.083 (IC [-0.119, -0.047], só informativo)                  |
| WER pareado do texto final (limite superior ≤ +2 pp)                                     | ok       | dif +0.0 pp, IC 95% [−1.4 pp, +1.7 pp], limite superior ≤ +2.0 pp                                                       |
| texto final fora do conjunto de A (informativo)                                          | ok       | 9 de 88 textos de B fora do conjunto de A (normalizado: 9); WER A 21.1%, B 21.1%; falas em que A varia entre rodadas: 5 |
| SLO framesLongos.n50                                                                     | ok       | A 0, B 0, limite 5                                                                                                      |
| SLO framesLongos.n100                                                                    | ok       | A 0, B 0, limite 3                                                                                                      |
| SLO framesLongos.somaMs                                                                  | ok       | A 0, B 0, limite 500                                                                                                    |
| SLO cpuSilencio.processoPct                                                              | ok       | A 13.625, B 13.735, limite 24.076                                                                                       |
| SLO rendersPorS.silencio                                                                 | ok       | A 27.135, B 27.204, limite 36.918                                                                                       |
| SLO rendersPorS.fala                                                                     | ok       | A 102.514, B 102.471, limite 138.143                                                                                    |
| SLO fimDaFalaAteLegendaMs.taxaDeFalha                                                    | ok       | A 0, B 0, limite 0.15                                                                                                   |

**Veredito: SEM DIFERENÇA PROVADA**
