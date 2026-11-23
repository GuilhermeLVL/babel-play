### A/B dos parciais (v3) — A=v1.desktop (12 rodadas) × B=v1v3.desktop (12 rodadas)

Bootstrap pareado por fala de 10000 reamostragens, semente 20261121, IC 95%.

| métrica                                        | A     | B     | B − A  | IC 95% da diferença        | falas |
| ---------------------------------------------- | ----- | ----- | ------ | -------------------------- | ----- |
| atraso por palavra, original, p50 (ms)         | 255   | 265   | +10    | [−45, +105]                | 6     |
| atraso por palavra, original, p90 (ms)         | 2334  | 2338  | +3     | [−645, +832]               | 6     |
| atraso por palavra, tradução (proxy), p50 (ms) | 1290  | 2692  | +1402  | [+367, +1916]              | 6     |
| atraso por palavra, tradução (proxy), p90 (ms) | 3931  | 4074  | +143   | [−37, +456]                | 6     |
| erasure do original                            | 3.595 | 3.553 | −0.042 | [−0.420, +0.343]           | 8     |
| erasure da tradução (proxy)                    | 2.010 | 0.121 | −1.889 | [−2.673, −1.064]           | 8     |
| fimDaFalaAteLegendaMs p75 (ms)                 | 853   | 1021  | +169   | [−5, +181]                 |       |
| 1º texto na tela (mediana das rodadas, ms)     | 1226  | 1020  | −206   | (sem IC: medida de rodada) |       |

Guardas do SLO (mediana das rodadas válidas):

| guarda                            | A      | B       | limite  | situação |
| --------------------------------- | ------ | ------- | ------- | -------- |
| framesLongos.n50                  | 0      | 0       | 5       | ok       |
| framesLongos.n100                 | 0      | 0       | 3       | ok       |
| framesLongos.somaMs               | 0      | 0       | 500     | ok       |
| cpuSilencio.processoPct           | 13.279 | 13.215  | 23.591  | ok       |
| rendersPorS.silencio              | 22.919 | 22.919  | 31.649  | ok       |
| rendersPorS.fala                  | 223.45 | 203.229 | 289.313 | ok       |
| fimDaFalaAteLegendaMs.taxaDeFalha | 0      | 0       | 0.15    | ok       |

Primária (atraso da tradução p50): efeito +108.7% sobre A; IC inteiro ACIMA de 0 (pior).

| guarda                                              | situação     | detalhe                                                                                                                 |
| --------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------- |
| fimDaFalaAteLegendaMs p75                           | **reprovou** | dif 169 ms, IC 95% [-5, 181], limite superior ≤ 0                                                                       |
| erasureOriginal (Emenda 1: não piorar contra A)     | **reprovou** | dif -0.042, IC 95% [-0.420, 0.343], limite superior ≤ 0.050                                                             |
| erasureTraducao (Emenda 1: não piorar contra A)     | ok           | dif -1.889, IC 95% [-2.673, -1.064], limite superior ≤ 0.050                                                            |
| atrasoDePalavraMs p50 do original (não pode piorar) | ok           | dif 10, IC 95% [-45, 105], reprova só com o IC inteiro acima de 0                                                       |
| texto final do original                             | **reprovou** | 2 de 96 textos de B fora do conjunto de A (normalizado: 1); WER A 20.7%, B 20.2%; falas em que A varia entre rodadas: 5 |
| tradução final                                      | **reprovou** | 34 de 96 traduções de B fora do conjunto de A (normalizado: 22); falas em que A varia entre rodadas: 7                  |
| SLO framesLongos.n50                                | ok           | A 0, B 0, limite 5                                                                                                      |
| SLO framesLongos.n100                               | ok           | A 0, B 0, limite 3                                                                                                      |
| SLO framesLongos.somaMs                             | ok           | A 0, B 0, limite 500                                                                                                    |
| SLO cpuSilencio.processoPct                         | ok           | A 13.279, B 13.215, limite 23.591                                                                                       |
| SLO rendersPorS.silencio                            | ok           | A 22.919, B 22.919, limite 31.649                                                                                       |
| SLO rendersPorS.fala                                | ok           | A 223.45, B 203.229, limite 289.313                                                                                     |
| SLO fimDaFalaAteLegendaMs.taxaDeFalha               | ok           | A 0, B 0, limite 0.15                                                                                                   |

**Veredito: REPROVADO** (guardas reprovadas: fimDaFalaAteLegendaMs p75; erasureOriginal (Emenda 1: não piorar contra A); texto final do original; tradução final)
