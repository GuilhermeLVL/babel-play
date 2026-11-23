### A/B dos parciais (v4) — A=atual.desktop (15 rodadas) × B=v6-pt.desktop (15 rodadas)

Bootstrap pareado por fala de 10000 reamostragens, semente 20261121, IC 95%.

| métrica                                        | A         | B         | B − A  | IC 95% da diferença        | falas |
| ---------------------------------------------- | --------- | --------- | ------ | -------------------------- | ----- |
| atraso por palavra, original, p50 (ms)         | 2637      | 1102      | −1535  | [−1700, −1283]             | 14    |
| atraso por palavra, original, p90 (ms)         | 4409      | 3033      | −1375  | [−2032, −722]              | 14    |
| atraso por palavra, tradução (proxy), p50 (ms) | —         | —         | —      | —                          | 0     |
| atraso por palavra, tradução (proxy), p90 (ms) | —         | —         | —      | —                          | 0     |
| erasure do original                            | 0.000     | 0.371     | +0.371 | [+0.256, +0.481]           | 16    |
| erasure da tradução (proxy)                    | undefined | undefined | —      | —                          | 0     |
| fimDaFalaAteLegendaMs p75                      | —         | —         | —      | —                          |       |
| fimDaFalaAteOriginalMs p75 (ms)                | 925       | 973       | +48    | [+1, +116]                 |       |
| 1º texto na tela (mediana das rodadas, ms)     | 6313      | 3013      | −3300  | (sem IC: medida de rodada) |       |

Guardas do SLO (mediana das rodadas válidas):

| guarda                            | A      | B      | limite | situação   |
| --------------------------------- | ------ | ------ | ------ | ---------- |
| framesLongos.n50                  | 0      | 0      | 5      | ok         |
| framesLongos.n100                 | 0      | 0      | 3      | ok         |
| framesLongos.somaMs               | 0      | 0      | 500    | ok         |
| cpuSilencio.processoPct           | 15.846 | 15.533 | 27.184 | ok         |
| rendersPorS.silencio              | 22.839 | 22.839 | 31.548 | ok         |
| rendersPorS.fala                  | 58.212 | 63.045 | 82.765 | ok         |
| fimDaFalaAteLegendaMs.taxaDeFalha | —      | —      | —      | sem-medida |

Primária (atraso do original p50): efeito −58.2% sobre A; IC inteiro abaixo de 0 e efeito >= 20%.

| guarda                                                                                   | situação     | detalhe                                                                                                                |
| ---------------------------------------------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------- |
| fimDaFalaAteOriginalMs p75 (guarda 1 sem tradução)                                       | **reprovou** | dif 48 ms, IC 95% [1, 116], limite superior ≤ 30 ms                                                                    |
| erasureOriginal de B (V4: orçamento absoluto, média ≤ 0.5 e limite superior do IC ≤ 0.6) | ok           | B média 0.371, IC 95% de B [0.256, 0.481]; A 0.000, B − A 0.371 (IC [0.256, 0.481], só informativo)                    |
| WER pareado do texto final (limite superior ≤ +2 pp)                                     | ok           | dif +0.0 pp, IC 95% [−0.5 pp, +0.5 pp], limite superior ≤ +2.0 pp                                                      |
| texto final fora do conjunto de A (informativo)                                          | ok           | 6 de 240 textos de B fora do conjunto de A (normalizado: 6); WER A 2.4%, B 2.4%; falas em que A varia entre rodadas: 6 |
| SLO framesLongos.n50                                                                     | ok           | A 0, B 0, limite 5                                                                                                     |
| SLO framesLongos.n100                                                                    | ok           | A 0, B 0, limite 3                                                                                                     |
| SLO framesLongos.somaMs                                                                  | ok           | A 0, B 0, limite 500                                                                                                   |
| SLO cpuSilencio.processoPct                                                              | ok           | A 15.846, B 15.533, limite 27.184                                                                                      |
| SLO rendersPorS.silencio                                                                 | ok           | A 22.839, B 22.839, limite 31.548                                                                                      |
| SLO rendersPorS.fala                                                                     | ok           | A 58.212, B 63.045, limite 82.765                                                                                      |
| SLO fimDaFalaAteLegendaMs.taxaDeFalha                                                    | sem-medida   | A —, B —, limite —                                                                                                     |

**Veredito: REPROVADO** (guardas reprovadas: fimDaFalaAteOriginalMs p75 (guarda 1 sem tradução))
