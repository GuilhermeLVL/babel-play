### A/B dos parciais (v3) — A=v1.fraco (12 rodadas) × B=v1v3.fraco (12 rodadas)

Bootstrap pareado por fala de 10000 reamostragens, semente 20261121, IC 95%.

| métrica                                        | A     | B     | B − A  | IC 95% da diferença        | falas |
| ---------------------------------------------- | ----- | ----- | ------ | -------------------------- | ----- |
| atraso por palavra, original, p50 (ms)         | 1650  | 1530  | −120   | [−313, +36]                | 6     |
| atraso por palavra, original, p90 (ms)         | 3822  | 3706  | −117   | [−256, +227]               | 6     |
| atraso por palavra, tradução (proxy), p50 (ms) | 2409  | 3079  | +670   | [+226, +1067]              | 6     |
| atraso por palavra, tradução (proxy), p90 (ms) | 4268  | 4432  | +164   | [−1, +328]                 | 6     |
| erasure do original                            | 0.561 | 0.556 | −0.005 | [−0.057, +0.037]           | 8     |
| erasure da tradução (proxy)                    | 0.426 | 0.000 | −0.426 | [−0.606, −0.263]           | 8     |
| fimDaFalaAteLegendaMs p75 (ms)                 | 1222  | 1399  | +177   | [+20, +200]                |       |
| 1º texto na tela (mediana das rodadas, ms)     | 1872  | 1875  | +3     | (sem IC: medida de rodada) |       |

Guardas do SLO (mediana das rodadas válidas):

| guarda                            | A      | B       | limite | situação |
| --------------------------------- | ------ | ------- | ------ | -------- |
| framesLongos.n50                  | 0      | 0       | 5      | ok       |
| framesLongos.n100                 | 0      | 0       | 3      | ok       |
| framesLongos.somaMs               | 0      | 0       | 500    | ok       |
| cpuSilencio.processoPct           | 13.563 | 13.224  | 23.988 | ok       |
| rendersPorS.silencio              | 27.154 | 27.192  | 36.942 | ok       |
| rendersPorS.fala                  | 109.2  | 103.728 | 146.5  | ok       |
| fimDaFalaAteLegendaMs.taxaDeFalha | 0      | 0       | 0.15   | ok       |

Primária (atraso da tradução p50): efeito +27.8% sobre A; IC inteiro ACIMA de 0 (pior).

| guarda                                              | situação     | detalhe                                                                                                                 |
| --------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------- |
| fimDaFalaAteLegendaMs p75                           | **reprovou** | dif 177 ms, IC 95% [20, 200], limite superior ≤ 0                                                                       |
| erasureOriginal (Emenda 1: não piorar contra A)     | ok           | dif -0.005, IC 95% [-0.057, 0.037], limite superior ≤ 0.050                                                             |
| erasureTraducao (Emenda 1: não piorar contra A)     | ok           | dif -0.426, IC 95% [-0.606, -0.263], limite superior ≤ 0.050                                                            |
| atrasoDePalavraMs p50 do original (não pode piorar) | ok           | dif -120, IC 95% [-313, 36], reprova só com o IC inteiro acima de 0                                                     |
| texto final do original                             | **reprovou** | 6 de 96 textos de B fora do conjunto de A (normalizado: 6); WER A 20.8%, B 20.9%; falas em que A varia entre rodadas: 5 |
| tradução final                                      | **reprovou** | 56 de 96 traduções de B fora do conjunto de A (normalizado: 54); falas em que A varia entre rodadas: 7                  |
| SLO framesLongos.n50                                | ok           | A 0, B 0, limite 5                                                                                                      |
| SLO framesLongos.n100                               | ok           | A 0, B 0, limite 3                                                                                                      |
| SLO framesLongos.somaMs                             | ok           | A 0, B 0, limite 500                                                                                                    |
| SLO cpuSilencio.processoPct                         | ok           | A 13.563, B 13.224, limite 23.988                                                                                       |
| SLO rendersPorS.silencio                            | ok           | A 27.154, B 27.192, limite 36.942                                                                                       |
| SLO rendersPorS.fala                                | ok           | A 109.2, B 103.728, limite 146.5                                                                                        |
| SLO fimDaFalaAteLegendaMs.taxaDeFalha               | ok           | A 0, B 0, limite 0.15                                                                                                   |

**Veredito: REPROVADO** (guardas reprovadas: fimDaFalaAteLegendaMs p75; texto final do original; tradução final)
