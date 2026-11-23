### A/B dos parciais (v1b) — A=atual.fraco (11 rodadas) × B=v1b-cauda-decode.fraco (11 rodadas)

Bootstrap pareado por fala de 10000 reamostragens, semente 20261121, IC 95%.

| métrica                                        | A     | B     | B − A  | IC 95% da diferença        | falas |
| ---------------------------------------------- | ----- | ----- | ------ | -------------------------- | ----- |
| atraso por palavra, original, p50 (ms)         | 1588  | 1603  | +15    | [−140, +196]               | 6     |
| atraso por palavra, original, p90 (ms)         | 3705  | 3718  | +13    | [−117, +593]               | 6     |
| atraso por palavra, tradução (proxy), p50 (ms) | 2477  | 2534  | +57    | [−60, +279]                | 6     |
| atraso por palavra, tradução (proxy), p90 (ms) | 4262  | 4299  | +37    | [−64, +118]                | 6     |
| erasure do original                            | 0.503 | 0.484 | −0.019 | [−0.083, +0.029]           | 8     |
| erasure da tradução (proxy)                    | 0.452 | 0.445 | −0.007 | [−0.069, +0.048]           | 8     |
| fimDaFalaAteLegendaMs p75 (ms)                 | 1226  | 1229  | +3     | [−36, +68]                 |       |
| 1º texto na tela (mediana das rodadas, ms)     | 1922  | 1920  | −2     | (sem IC: medida de rodada) |       |

Guardas do SLO (mediana das rodadas válidas):

| guarda                            | A       | B       | limite  | situação |
| --------------------------------- | ------- | ------- | ------- | -------- |
| framesLongos.n50                  | 0       | 0       | 5       | ok       |
| framesLongos.n100                 | 0       | 0       | 3       | ok       |
| framesLongos.somaMs               | 0       | 0       | 500     | ok       |
| cpuSilencio.processoPct           | 13.406  | 13.527  | 23.768  | ok       |
| rendersPorS.silencio              | 27.15   | 27.164  | 36.938  | ok       |
| rendersPorS.fala                  | 101.842 | 101.474 | 137.303 | ok       |
| fimDaFalaAteLegendaMs.taxaDeFalha | 0       | 0       | 0.15    | ok       |

Primária (atraso do original p50): efeito +0.9% sobre A; IC cruza 0 ou efeito < 20%.

| guarda                                               | situação     | detalhe                                                                                                                 |
| ---------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------- |
| fimDaFalaAteLegendaMs p75                            | **reprovou** | dif 3 ms, IC 95% [-35, 68], limite superior ≤ 30 ms                                                                     |
| erasureOriginal (Emenda 1: não piorar contra A)      | ok           | dif -0.019, IC 95% [-0.083, 0.029], limite superior ≤ 0.050                                                             |
| WER pareado do texto final (limite superior ≤ +2 pp) | **reprovou** | dif +0.9 pp, IC 95% [−0.5 pp, +2.8 pp], limite superior ≤ +2.0 pp                                                       |
| texto final fora do conjunto de A (informativo)      | ok           | 2 de 88 textos de B fora do conjunto de A (normalizado: 2); WER A 21.0%, B 21.9%; falas em que A varia entre rodadas: 5 |
| SLO framesLongos.n50                                 | ok           | A 0, B 0, limite 5                                                                                                      |
| SLO framesLongos.n100                                | ok           | A 0, B 0, limite 3                                                                                                      |
| SLO framesLongos.somaMs                              | ok           | A 0, B 0, limite 500                                                                                                    |
| SLO cpuSilencio.processoPct                          | ok           | A 13.406, B 13.527, limite 23.768                                                                                       |
| SLO rendersPorS.silencio                             | ok           | A 27.15, B 27.164, limite 36.938                                                                                        |
| SLO rendersPorS.fala                                 | ok           | A 101.842, B 101.474, limite 137.303                                                                                    |
| SLO fimDaFalaAteLegendaMs.taxaDeFalha                | ok           | A 0, B 0, limite 0.15                                                                                                   |

**Veredito: REPROVADO** (guardas reprovadas: fimDaFalaAteLegendaMs p75; WER pareado do texto final (limite superior ≤ +2 pp))
