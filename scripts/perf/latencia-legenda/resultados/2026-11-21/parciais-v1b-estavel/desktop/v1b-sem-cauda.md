### A/B dos parciais (v1b) — A=atual.desktop (11 rodadas) × B=v1b-sem-cauda.desktop (11 rodadas)

Bootstrap pareado por fala de 10000 reamostragens, semente 20261121, IC 95%.

| métrica                                        | A     | B     | B − A  | IC 95% da diferença        | falas |
| ---------------------------------------------- | ----- | ----- | ------ | -------------------------- | ----- |
| atraso por palavra, original, p50 (ms)         | 1164  | 1846  | +682   | [+191, +1033]              | 6     |
| atraso por palavra, original, p90 (ms)         | 2753  | 3376  | +623   | [+6, +841]                 | 6     |
| atraso por palavra, tradução (proxy), p50 (ms) | 2129  | 2554  | +425   | [+52, +786]                | 6     |
| atraso por palavra, tradução (proxy), p90 (ms) | 4016  | 4069  | +53    | [−30, +252]                | 6     |
| erasure do original                            | 0.659 | 0.230 | −0.429 | [−0.659, −0.162]           | 8     |
| erasure da tradução (proxy)                    | 0.508 | 0.229 | −0.279 | [−0.527, −0.049]           | 8     |
| fimDaFalaAteLegendaMs p75 (ms)                 | 1015  | 1026  | +11    | [−76, +166]                |       |
| 1º texto na tela (mediana das rodadas, ms)     | 3255  | 2781  | −474   | (sem IC: medida de rodada) |       |

Guardas do SLO (mediana das rodadas válidas):

| guarda                            | A      | B      | limite  | situação |
| --------------------------------- | ------ | ------ | ------- | -------- |
| framesLongos.n50                  | 0      | 0      | 5       | ok       |
| framesLongos.n100                 | 0      | 0      | 3       | ok       |
| framesLongos.somaMs               | 0      | 0      | 500     | ok       |
| cpuSilencio.processoPct           | 14.457 | 14.663 | 25.24   | ok       |
| rendersPorS.silencio              | 22.919 | 22.919 | 31.649  | ok       |
| rendersPorS.fala                  | 94.452 | 93.065 | 128.065 | ok       |
| fimDaFalaAteLegendaMs.taxaDeFalha | 0      | 0      | 0.15    | ok       |

Primária (atraso do original p50): efeito +58.6% sobre A; IC inteiro ACIMA de 0 (pior).

| guarda                                               | situação     | detalhe                                                                                                                 |
| ---------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------- |
| fimDaFalaAteLegendaMs p75                            | **reprovou** | dif 11 ms, IC 95% [-76, 166], limite superior ≤ 30 ms                                                                   |
| erasureOriginal (Emenda 1: não piorar contra A)      | ok           | dif -0.429, IC 95% [-0.659, -0.162], limite superior ≤ 0.050                                                            |
| WER pareado do texto final (limite superior ≤ +2 pp) | ok           | dif −0.4 pp, IC 95% [−1.6 pp, +0.6 pp], limite superior ≤ +2.0 pp                                                       |
| texto final fora do conjunto de A (informativo)      | ok           | 0 de 88 textos de B fora do conjunto de A (normalizado: 0); WER A 21.7%, B 21.3%; falas em que A varia entre rodadas: 6 |
| SLO framesLongos.n50                                 | ok           | A 0, B 0, limite 5                                                                                                      |
| SLO framesLongos.n100                                | ok           | A 0, B 0, limite 3                                                                                                      |
| SLO framesLongos.somaMs                              | ok           | A 0, B 0, limite 500                                                                                                    |
| SLO cpuSilencio.processoPct                          | ok           | A 14.457, B 14.663, limite 25.24                                                                                        |
| SLO rendersPorS.silencio                             | ok           | A 22.919, B 22.919, limite 31.649                                                                                       |
| SLO rendersPorS.fala                                 | ok           | A 94.452, B 93.065, limite 128.065                                                                                      |
| SLO fimDaFalaAteLegendaMs.taxaDeFalha                | ok           | A 0, B 0, limite 0.15                                                                                                   |

**Veredito: REPROVADO** (guardas reprovadas: fimDaFalaAteLegendaMs p75)
