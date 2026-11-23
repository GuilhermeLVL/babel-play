### A/B dos parciais (v4) — A=atual.desktop (11 rodadas) × B=v5-en.desktop (11 rodadas)

Bootstrap pareado por fala de 10000 reamostragens, semente 20261121, IC 95%.

| métrica                                        | A     | B     | B − A  | IC 95% da diferença        | falas |
| ---------------------------------------------- | ----- | ----- | ------ | -------------------------- | ----- |
| atraso por palavra, original, p50 (ms)         | 1168  | 1507  | +339   | [−376, +868]               | 6     |
| atraso por palavra, original, p90 (ms)         | 2691  | 3456  | +765   | [+6, +1052]                | 6     |
| atraso por palavra, tradução (proxy), p50 (ms) | 2211  | 2385  | +174   | [−164, +475]               | 6     |
| atraso por palavra, tradução (proxy), p90 (ms) | 4002  | 3919  | −83    | [−174, +148]               | 6     |
| erasure do original                            | 0.638 | 0.390 | −0.249 | [−0.498, +0.050]           | 8     |
| erasure da tradução (proxy)                    | 0.514 | 0.440 | −0.074 | [−0.326, +0.241]           | 8     |
| fimDaFalaAteLegendaMs p75 (ms)                 | 980   | 963   | −17    | [−175, +12]                |       |
| fimDaFalaAteOriginalMs p75 (ms)                | 808   | 804   | −3     | [−16, +5]                  |       |
| 1º texto na tela (mediana das rodadas, ms)     | 3201  | 1626  | −1575  | (sem IC: medida de rodada) |       |

Guardas do SLO (mediana das rodadas válidas):

| guarda                            | A      | B       | limite  | situação |
| --------------------------------- | ------ | ------- | ------- | -------- |
| framesLongos.n50                  | 0      | 0       | 5       | ok       |
| framesLongos.n100                 | 0      | 0       | 3       | ok       |
| framesLongos.somaMs               | 0      | 0       | 500     | ok       |
| cpuSilencio.processoPct           | 13.828 | 13.685  | 24.359  | ok       |
| rendersPorS.silencio              | 22.919 | 22.919  | 31.649  | ok       |
| rendersPorS.fala                  | 94.452 | 111.032 | 128.065 | ok       |
| fimDaFalaAteLegendaMs.taxaDeFalha | 0      | 0       | 0.15    | ok       |

Primária (atraso do original p50): efeito +29.0% sobre A; IC cruza 0 ou efeito < 20%.

| guarda                                                                                   | situação     | detalhe                                                                                                                 |
| ---------------------------------------------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------- |
| fimDaFalaAteLegendaMs p75                                                                | ok           | dif -16 ms, IC 95% [-175, 12], limite superior ≤ 30 ms                                                                  |
| erasureOriginal de B (V4: orçamento absoluto, média ≤ 0.5 e limite superior do IC ≤ 0.6) | ok           | B média 0.390, IC 95% de B [0.228, 0.559]; A 0.638, B − A -0.249 (IC [-0.498, 0.050], só informativo)                   |
| WER pareado do texto final (limite superior ≤ +2 pp)                                     | **reprovou** | dif −0.1 pp, IC 95% [−2.2 pp, +3.0 pp], limite superior ≤ +2.0 pp                                                       |
| texto final fora do conjunto de A (informativo)                                          | ok           | 1 de 88 textos de B fora do conjunto de A (normalizado: 1); WER A 20.3%, B 20.2%; falas em que A varia entre rodadas: 5 |
| SLO framesLongos.n50                                                                     | ok           | A 0, B 0, limite 5                                                                                                      |
| SLO framesLongos.n100                                                                    | ok           | A 0, B 0, limite 3                                                                                                      |
| SLO framesLongos.somaMs                                                                  | ok           | A 0, B 0, limite 500                                                                                                    |
| SLO cpuSilencio.processoPct                                                              | ok           | A 13.828, B 13.685, limite 24.359                                                                                       |
| SLO rendersPorS.silencio                                                                 | ok           | A 22.919, B 22.919, limite 31.649                                                                                       |
| SLO rendersPorS.fala                                                                     | ok           | A 94.452, B 111.032, limite 128.065                                                                                     |
| SLO fimDaFalaAteLegendaMs.taxaDeFalha                                                    | ok           | A 0, B 0, limite 0.15                                                                                                   |

**Veredito: REPROVADO** (guardas reprovadas: WER pareado do texto final (limite superior ≤ +2 pp))
