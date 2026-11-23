### A/B dos parciais (v4) — A=atual.desktop (22 rodadas) × B=v7-pt.desktop (22 rodadas)

Bootstrap pareado por fala de 10000 reamostragens, semente 20261121, IC 95%.

| métrica                                        | A         | B         | B − A  | IC 95% da diferença        | falas |
| ---------------------------------------------- | --------- | --------- | ------ | -------------------------- | ----- |
| atraso por palavra, original, p50 (ms)         | 2640      | 1104      | −1536  | [−1713, −1268]             | 14    |
| atraso por palavra, original, p90 (ms)         | 4412      | 3092      | −1320  | [−2027, −750]              | 14    |
| atraso por palavra, tradução (proxy), p50 (ms) | —         | —         | —      | —                          | 0     |
| atraso por palavra, tradução (proxy), p90 (ms) | —         | —         | —      | —                          | 0     |
| erasure do original                            | 0.000     | 0.412     | +0.412 | [+0.298, +0.520]           | 16    |
| erasure da tradução (proxy)                    | undefined | undefined | —      | —                          | 0     |
| fimDaFalaAteLegendaMs p75                      | —         | —         | —      | —                          |       |
| fimDaFalaAteOriginalMs p75 (ms)                | 926       | 941       | +15    | [−32, +93]                 |       |
| 1º texto na tela (mediana das rodadas, ms)     | 6303      | 3041      | −3262  | (sem IC: medida de rodada) |       |

Guardas do SLO (mediana das rodadas válidas):

| guarda                            | A      | B      | limite | situação   |
| --------------------------------- | ------ | ------ | ------ | ---------- |
| framesLongos.n50                  | 0      | 0      | 5      | ok         |
| framesLongos.n100                 | 0      | 0      | 3      | ok         |
| framesLongos.somaMs               | 0      | 0      | 500    | ok         |
| cpuSilencio.processoPct           | 13.975 | 14.108 | 24.565 | ok         |
| rendersPorS.silencio              | 22.839 | 22.839 | 31.548 | ok         |
| rendersPorS.fala                  | 57.98  | 62.868 | 82.475 | ok         |
| fimDaFalaAteLegendaMs.taxaDeFalha | —      | —      | —      | sem-medida |

Primária (atraso do original p50): efeito −58.2% sobre A; IC inteiro abaixo de 0 e efeito >= 20%.

| guarda                                                                                   | situação   | detalhe                                                                                                                |
| ---------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------- |
| fimDaFalaAteOriginalMs p75 (guarda 1 sem tradução)                                       | ok         | dif 15 ms, IC 95% [-32, 93], limite superior ≤ 100 ms                                                                  |
| erasureOriginal de B (V4: orçamento absoluto, média ≤ 0.5 e limite superior do IC ≤ 0.6) | ok         | B média 0.412, IC 95% de B [0.298, 0.520]; A 0.000, B − A 0.412 (IC [0.298, 0.520], só informativo)                    |
| WER pareado do texto final (limite superior ≤ +2 pp)                                     | ok         | dif +0.2 pp, IC 95% [−0.2 pp, +0.9 pp], limite superior ≤ +2.0 pp                                                      |
| texto final fora do conjunto de A (informativo)                                          | ok         | 5 de 352 textos de B fora do conjunto de A (normalizado: 5); WER A 2.4%, B 2.6%; falas em que A varia entre rodadas: 7 |
| SLO framesLongos.n50                                                                     | ok         | A 0, B 0, limite 5                                                                                                     |
| SLO framesLongos.n100                                                                    | ok         | A 0, B 0, limite 3                                                                                                     |
| SLO framesLongos.somaMs                                                                  | ok         | A 0, B 0, limite 500                                                                                                   |
| SLO cpuSilencio.processoPct                                                              | ok         | A 13.975, B 14.108, limite 24.565                                                                                      |
| SLO rendersPorS.silencio                                                                 | ok         | A 22.839, B 22.839, limite 31.548                                                                                      |
| SLO rendersPorS.fala                                                                     | ok         | A 57.98, B 62.868, limite 82.475                                                                                       |
| SLO fimDaFalaAteLegendaMs.taxaDeFalha                                                    | sem-medida | A —, B —, limite —                                                                                                     |

**Veredito: APROVADO**
