### A/B dos parciais (v1) — A=atual.fraco (12 rodadas) × B=v1.fraco (12 rodadas)

Bootstrap pareado por fala de 10000 reamostragens, semente 20261121, IC 95%.

| métrica                                        | A     | B     | B − A  | IC 95% da diferença        | falas |
| ---------------------------------------------- | ----- | ----- | ------ | -------------------------- | ----- |
| atraso por palavra, original, p50 (ms)         | 1650  | 1650  | 0      | [−132, +212]               | 6     |
| atraso por palavra, original, p90 (ms)         | 3707  | 3822  | +115   | [−125, +527]               | 6     |
| atraso por palavra, tradução (proxy), p50 (ms) | 2456  | 2409  | −47    | [−355, +156]               | 6     |
| atraso por palavra, tradução (proxy), p90 (ms) | 4264  | 4268  | +4     | [−168, +124]               | 6     |
| erasure do original                            | 0.508 | 0.561 | +0.053 | [+0.003, +0.125]           | 8     |
| erasure da tradução (proxy)                    | 0.456 | 0.426 | −0.030 | [−0.139, +0.047]           | 8     |
| fimDaFalaAteLegendaMs p75 (ms)                 | 1214  | 1222  | +8     | [−25, +20]                 |       |
| 1º texto na tela (mediana das rodadas, ms)     | 1920  | 1872  | −49    | (sem IC: medida de rodada) |       |

Guardas do SLO (mediana das rodadas válidas):

| guarda                            | A       | B      | limite  | situação |
| --------------------------------- | ------- | ------ | ------- | -------- |
| framesLongos.n50                  | 0       | 0      | 5       | ok       |
| framesLongos.n100                 | 0       | 0      | 3       | ok       |
| framesLongos.somaMs               | 0       | 0      | 500     | ok       |
| cpuSilencio.processoPct           | 13.326  | 13.563 | 23.656  | ok       |
| rendersPorS.silencio              | 27.166  | 27.154 | 36.957  | ok       |
| rendersPorS.fala                  | 102.081 | 109.2  | 137.601 | ok       |
| fimDaFalaAteLegendaMs.taxaDeFalha | 0       | 0      | 0.15    | ok       |

Primária (atraso do original p50): efeito 0.0% sobre A; IC cruza 0 ou efeito < 20%.

| guarda                                          | situação     | detalhe                                                                                                                 |
| ----------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------- |
| fimDaFalaAteLegendaMs p75                       | **reprovou** | dif 8 ms, IC 95% [-24, 20], limite superior ≤ 0                                                                         |
| erasureOriginal (Emenda 1: não piorar contra A) | **reprovou** | dif 0.053, IC 95% [0.003, 0.125], limite superior ≤ 0.050                                                               |
| texto final do original                         | **reprovou** | 6 de 96 textos de B fora do conjunto de A (normalizado: 3); WER A 21.2%, B 20.8%; falas em que A varia entre rodadas: 5 |
| SLO framesLongos.n50                            | ok           | A 0, B 0, limite 5                                                                                                      |
| SLO framesLongos.n100                           | ok           | A 0, B 0, limite 3                                                                                                      |
| SLO framesLongos.somaMs                         | ok           | A 0, B 0, limite 500                                                                                                    |
| SLO cpuSilencio.processoPct                     | ok           | A 13.326, B 13.563, limite 23.656                                                                                       |
| SLO rendersPorS.silencio                        | ok           | A 27.166, B 27.154, limite 36.957                                                                                       |
| SLO rendersPorS.fala                            | ok           | A 102.081, B 109.2, limite 137.601                                                                                      |
| SLO fimDaFalaAteLegendaMs.taxaDeFalha           | ok           | A 0, B 0, limite 0.15                                                                                                   |

**Veredito: REPROVADO** (guardas reprovadas: fimDaFalaAteLegendaMs p75; erasureOriginal (Emenda 1: não piorar contra A); texto final do original)
