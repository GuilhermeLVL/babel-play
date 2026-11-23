### A/B dos parciais (v4) — A=atual.fraco (11 rodadas) × B=v4-en.fraco (11 rodadas)

Bootstrap pareado por fala de 10000 reamostragens, semente 20261121, IC 95%.

| métrica                                        | A     | B     | B − A  | IC 95% da diferença        | falas |
| ---------------------------------------------- | ----- | ----- | ------ | -------------------------- | ----- |
| atraso por palavra, original, p50 (ms)         | 1775  | 1777  | +2     | [−156, +291]               | 6     |
| atraso por palavra, original, p90 (ms)         | 3793  | 3835  | +41    | [−63, +538]                | 6     |
| atraso por palavra, tradução (proxy), p50 (ms) | 2527  | 2682  | +155   | [−109, +422]               | 6     |
| atraso por palavra, tradução (proxy), p90 (ms) | 4242  | 4248  | +6     | [−21, +153]                | 6     |
| erasure do original                            | 0.532 | 0.434 | −0.098 | [−0.170, −0.053]           | 8     |
| erasure da tradução (proxy)                    | 0.502 | 0.377 | −0.125 | [−0.237, −0.049]           | 8     |
| fimDaFalaAteLegendaMs p75 (ms)                 | 1221  | 1239  | +18    | [−13, +83]                 |       |
| 1º texto na tela (mediana das rodadas, ms)     | 1915  | 1914  | −1     | (sem IC: medida de rodada) |       |

Guardas do SLO (mediana das rodadas válidas):

| guarda                            | A       | B       | limite  | situação |
| --------------------------------- | ------- | ------- | ------- | -------- |
| framesLongos.n50                  | 0       | 0       | 5       | ok       |
| framesLongos.n100                 | 0       | 0       | 3       | ok       |
| framesLongos.somaMs               | 0       | 0       | 500     | ok       |
| cpuSilencio.processoPct           | 14.007  | 14.115  | 24.61   | ok       |
| rendersPorS.silencio              | 27.15   | 27.151  | 36.938  | ok       |
| rendersPorS.fala                  | 102.774 | 100.195 | 138.468 | ok       |
| fimDaFalaAteLegendaMs.taxaDeFalha | 0       | 0       | 0.15    | ok       |

Primária (atraso do original p50): efeito +0.1% sobre A; IC cruza 0 ou efeito < 20%.

| guarda                                                                                   | situação     | detalhe                                                                                                                 |
| ---------------------------------------------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------- |
| fimDaFalaAteLegendaMs p75                                                                | **reprovou** | dif 18 ms, IC 95% [-13, 83], limite superior ≤ 30 ms                                                                    |
| erasureOriginal de B (V4: orçamento absoluto, média ≤ 0.5 e limite superior do IC ≤ 0.6) | ok           | B média 0.434, IC 95% de B [0.348, 0.547]; A 0.532, B − A -0.098 (IC [-0.170, -0.053], só informativo)                  |
| WER pareado do texto final (limite superior ≤ +2 pp)                                     | ok           | dif +0.0 pp, IC 95% [−1.8 pp, +1.3 pp], limite superior ≤ +2.0 pp                                                       |
| texto final fora do conjunto de A (informativo)                                          | ok           | 8 de 88 textos de B fora do conjunto de A (normalizado: 8); WER A 21.0%, B 21.0%; falas em que A varia entre rodadas: 5 |
| SLO framesLongos.n50                                                                     | ok           | A 0, B 0, limite 5                                                                                                      |
| SLO framesLongos.n100                                                                    | ok           | A 0, B 0, limite 3                                                                                                      |
| SLO framesLongos.somaMs                                                                  | ok           | A 0, B 0, limite 500                                                                                                    |
| SLO cpuSilencio.processoPct                                                              | ok           | A 14.007, B 14.115, limite 24.61                                                                                        |
| SLO rendersPorS.silencio                                                                 | ok           | A 27.15, B 27.151, limite 36.938                                                                                        |
| SLO rendersPorS.fala                                                                     | ok           | A 102.774, B 100.195, limite 138.468                                                                                    |
| SLO fimDaFalaAteLegendaMs.taxaDeFalha                                                    | ok           | A 0, B 0, limite 0.15                                                                                                   |

**Veredito: REPROVADO** (guardas reprovadas: fimDaFalaAteLegendaMs p75)
