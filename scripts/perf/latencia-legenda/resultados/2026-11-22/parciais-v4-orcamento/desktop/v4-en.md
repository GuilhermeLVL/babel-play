### A/B dos parciais (v4) — A=atual.desktop (11 rodadas) × B=v4-en.desktop (11 rodadas)

Bootstrap pareado por fala de 10000 reamostragens, semente 20261121, IC 95%.

| métrica                                        | A     | B     | B − A  | IC 95% da diferença        | falas |
| ---------------------------------------------- | ----- | ----- | ------ | -------------------------- | ----- |
| atraso por palavra, original, p50 (ms)         | 1161  | 1833  | +672   | [−96, +1157]               | 6     |
| atraso por palavra, original, p90 (ms)         | 2687  | 3479  | +792   | [+39, +1108]               | 6     |
| atraso por palavra, tradução (proxy), p50 (ms) | 2173  | 2509  | +337   | [+10, +642]                | 6     |
| atraso por palavra, tradução (proxy), p90 (ms) | 4004  | 4005  | +1     | [−136, +267]               | 6     |
| erasure do original                            | 0.634 | 0.396 | −0.238 | [−0.472, +0.042]           | 8     |
| erasure da tradução (proxy)                    | 0.463 | 0.387 | −0.076 | [−0.312, +0.172]           | 8     |
| fimDaFalaAteLegendaMs p75 (ms)                 | 1019  | 967   | −51    | [−183, +10]                |       |
| 1º texto na tela (mediana das rodadas, ms)     | 3202  | 1431  | −1771  | (sem IC: medida de rodada) |       |

Guardas do SLO (mediana das rodadas válidas):

| guarda                            | A      | B       | limite  | situação |
| --------------------------------- | ------ | ------- | ------- | -------- |
| framesLongos.n50                  | 0      | 0       | 5       | ok       |
| framesLongos.n100                 | 0      | 0       | 3       | ok       |
| framesLongos.somaMs               | 0      | 0       | 500     | ok       |
| cpuSilencio.processoPct           | 13.615 | 14.09   | 24.061  | ok       |
| rendersPorS.silencio              | 22.919 | 22.919  | 31.649  | ok       |
| rendersPorS.fala                  | 91.894 | 108.409 | 124.868 | ok       |
| fimDaFalaAteLegendaMs.taxaDeFalha | 0      | 0       | 0.15    | ok       |

Primária (atraso do original p50): efeito +57.9% sobre A; IC cruza 0 ou efeito < 20%.

| guarda                                                                                   | situação | detalhe                                                                                                                 |
| ---------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------- |
| fimDaFalaAteLegendaMs p75                                                                | ok       | dif -51 ms, IC 95% [-183, 10], limite superior ≤ 30 ms                                                                  |
| erasureOriginal de B (V4: orçamento absoluto, média ≤ 0.5 e limite superior do IC ≤ 0.6) | ok       | B média 0.396, IC 95% de B [0.268, 0.540]; A 0.634, B − A -0.238 (IC [-0.472, 0.042], só informativo)                   |
| WER pareado do texto final (limite superior ≤ +2 pp)                                     | ok       | dif +0.0 pp, IC 95% [−2.4 pp, +1.6 pp], limite superior ≤ +2.0 pp                                                       |
| texto final fora do conjunto de A (informativo)                                          | ok       | 3 de 88 textos de B fora do conjunto de A (normalizado: 3); WER A 20.4%, B 20.4%; falas em que A varia entre rodadas: 5 |
| SLO framesLongos.n50                                                                     | ok       | A 0, B 0, limite 5                                                                                                      |
| SLO framesLongos.n100                                                                    | ok       | A 0, B 0, limite 3                                                                                                      |
| SLO framesLongos.somaMs                                                                  | ok       | A 0, B 0, limite 500                                                                                                    |
| SLO cpuSilencio.processoPct                                                              | ok       | A 13.615, B 14.09, limite 24.061                                                                                        |
| SLO rendersPorS.silencio                                                                 | ok       | A 22.919, B 22.919, limite 31.649                                                                                       |
| SLO rendersPorS.fala                                                                     | ok       | A 91.894, B 108.409, limite 124.868                                                                                     |
| SLO fimDaFalaAteLegendaMs.taxaDeFalha                                                    | ok       | A 0, B 0, limite 0.15                                                                                                   |

**Veredito: SEM DIFERENÇA PROVADA**
