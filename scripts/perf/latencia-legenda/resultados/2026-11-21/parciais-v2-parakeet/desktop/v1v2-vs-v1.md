### A/B dos parciais (v1) — A=v1.desktop (12 rodadas) × B=v1v2.desktop (12 rodadas)

Bootstrap pareado por fala de 10000 reamostragens, semente 20261121, IC 95%.

| métrica                                        | A         | B         | B − A  | IC 95% da diferença        | falas |
| ---------------------------------------------- | --------- | --------- | ------ | -------------------------- | ----- |
| atraso por palavra, original, p50 (ms)         | 2686      | 775       | −1911  | [−2230, −1549]             | 10    |
| atraso por palavra, original, p90 (ms)         | 4435      | 4052      | −383   | [−1154, +10]               | 10    |
| atraso por palavra, tradução (proxy), p50 (ms) | —         | —         | —      | —                          | 0     |
| atraso por palavra, tradução (proxy), p90 (ms) | —         | —         | —      | —                          | 0     |
| erasure do original                            | 0.000     | 0.740     | +0.740 | [+0.541, +0.964]           | 12    |
| erasure da tradução (proxy)                    | undefined | undefined | —      | —                          | 0     |
| fimDaFalaAteLegendaMs p75                      | —         | —         | —      | —                          |       |
| 1º texto na tela (mediana das rodadas, ms)     | 6342      | 1765      | −4577  | (sem IC: medida de rodada) |       |

Guardas do SLO (mediana das rodadas válidas):

| guarda                            | A      | B       | limite | situação   |
| --------------------------------- | ------ | ------- | ------ | ---------- |
| framesLongos.n50                  | 0      | 0       | 5      | ok         |
| framesLongos.n100                 | 0      | 0       | 3      | ok         |
| framesLongos.somaMs               | 0      | 0       | 500    | ok         |
| cpuSilencio.processoPct           | 12.147 | 11.331  | 22.005 | ok         |
| rendersPorS.silencio              | 22.906 | 22.906  | 31.632 | ok         |
| rendersPorS.fala                  | 56.911 | 134.238 | 81.139 | **piorou** |
| fimDaFalaAteLegendaMs.taxaDeFalha | —      | —       | —      | sem-medida |

Primária (atraso do original p50): efeito −71.1% sobre A; IC inteiro abaixo de 0 e efeito >= 20%.

| guarda                                          | situação     | detalhe                                                                                                                |
| ----------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------- |
| fimDaFalaAteLegendaMs p75                       | sem-medida   | sem falas pareadas                                                                                                     |
| erasureOriginal (Emenda 1: não piorar contra A) | **reprovou** | dif 0.740, IC 95% [0.541, 0.964], limite superior ≤ 0.050                                                              |
| texto final do original                         | **reprovou** | 2 de 144 textos de B fora do conjunto de A (normalizado: 0); WER A 3.1%, B 3.2%; falas em que A varia entre rodadas: 8 |
| SLO framesLongos.n50                            | ok           | A 0, B 0, limite 5                                                                                                     |
| SLO framesLongos.n100                           | ok           | A 0, B 0, limite 3                                                                                                     |
| SLO framesLongos.somaMs                         | ok           | A 0, B 0, limite 500                                                                                                   |
| SLO cpuSilencio.processoPct                     | ok           | A 12.147, B 11.331, limite 22.005                                                                                      |
| SLO rendersPorS.silencio                        | ok           | A 22.906, B 22.906, limite 31.632                                                                                      |
| SLO rendersPorS.fala                            | **reprovou** | A 56.911, B 134.238, limite 81.139                                                                                     |
| SLO fimDaFalaAteLegendaMs.taxaDeFalha           | sem-medida   | A —, B —, limite —                                                                                                     |

**Veredito: REPROVADO** (guardas reprovadas: erasureOriginal (Emenda 1: não piorar contra A); texto final do original; SLO rendersPorS.fala)
