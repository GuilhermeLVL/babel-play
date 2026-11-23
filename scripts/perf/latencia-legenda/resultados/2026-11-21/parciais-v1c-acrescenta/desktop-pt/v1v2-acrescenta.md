### A/B dos parciais (v1c) — A=atual.desktop (11 rodadas) × B=v1v2-acrescenta.desktop (11 rodadas)

Bootstrap pareado por fala de 10000 reamostragens, semente 20261121, IC 95%.

| métrica                                        | A         | B         | B − A  | IC 95% da diferença        | falas |
| ---------------------------------------------- | --------- | --------- | ------ | -------------------------- | ----- |
| atraso por palavra, original, p50 (ms)         | 2521      | 1154      | −1367  | [−1586, −1066]             | 10    |
| atraso por palavra, original, p90 (ms)         | 4231      | 3214      | −1017  | [−1593, −483]              | 10    |
| atraso por palavra, tradução (proxy), p50 (ms) | —         | —         | —      | —                          | 0     |
| atraso por palavra, tradução (proxy), p90 (ms) | —         | —         | —      | —                          | 0     |
| erasure do original                            | 0.000     | 0.406     | +0.406 | [+0.270, +0.529]           | 12    |
| erasure da tradução (proxy)                    | undefined | undefined | —      | —                          | 0     |
| fimDaFalaAteLegendaMs p75                      | —         | —         | —      | —                          |       |
| 1º texto na tela (mediana das rodadas, ms)     | 6289      | 3026      | −3263  | (sem IC: medida de rodada) |       |

Guardas do SLO (mediana das rodadas válidas):

| guarda                            | A      | B       | limite | situação   |
| --------------------------------- | ------ | ------- | ------ | ---------- |
| framesLongos.n50                  | 0      | 0       | 5      | ok         |
| framesLongos.n100                 | 0      | 0       | 3      | ok         |
| framesLongos.somaMs               | 0      | 0       | 500    | ok         |
| cpuSilencio.processoPct           | 14.769 | 13.944  | 25.676 | ok         |
| rendersPorS.silencio              | 22.906 | 22.906  | 31.632 | ok         |
| rendersPorS.fala                  | 57.244 | 113.266 | 81.555 | **piorou** |
| fimDaFalaAteLegendaMs.taxaDeFalha | —      | —       | —      | sem-medida |

Primária (atraso do original p50): efeito −54.2% sobre A; IC inteiro abaixo de 0 e efeito >= 20%.

| guarda                                               | situação     | detalhe                                                                                                                |
| ---------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------- |
| fimDaFalaAteLegendaMs p75                            | sem-medida   | sem falas pareadas                                                                                                     |
| erasureOriginal (Emenda 1: não piorar contra A)      | **reprovou** | dif 0.406, IC 95% [0.270, 0.529], limite superior ≤ 0.050                                                              |
| WER pareado do texto final (limite superior ≤ +2 pp) | ok           | dif +0.1 pp, IC 95% [−0.5 pp, +0.9 pp], limite superior ≤ +2.0 pp                                                      |
| texto final fora do conjunto de A (informativo)      | ok           | 4 de 132 textos de B fora do conjunto de A (normalizado: 3); WER A 2.9%, B 3.0%; falas em que A varia entre rodadas: 6 |
| SLO framesLongos.n50                                 | ok           | A 0, B 0, limite 5                                                                                                     |
| SLO framesLongos.n100                                | ok           | A 0, B 0, limite 3                                                                                                     |
| SLO framesLongos.somaMs                              | ok           | A 0, B 0, limite 500                                                                                                   |
| SLO cpuSilencio.processoPct                          | ok           | A 14.769, B 13.944, limite 25.676                                                                                      |
| SLO rendersPorS.silencio                             | ok           | A 22.906, B 22.906, limite 31.632                                                                                      |
| SLO rendersPorS.fala                                 | **reprovou** | A 57.244, B 113.266, limite 81.555                                                                                     |
| SLO fimDaFalaAteLegendaMs.taxaDeFalha                | sem-medida   | A —, B —, limite —                                                                                                     |

**Veredito: REPROVADO** (guardas reprovadas: erasureOriginal (Emenda 1: não piorar contra A); SLO rendersPorS.fala)
