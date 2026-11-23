### A/B dos parciais (v4) — A=atual.fraco (11 rodadas) × B=v7-en.fraco (11 rodadas)

Bootstrap pareado por fala de 10000 reamostragens, semente 20261121, IC 95%.

| métrica                                        | A     | B     | B − A  | IC 95% da diferença        | falas |
| ---------------------------------------------- | ----- | ----- | ------ | -------------------------- | ----- |
| atraso por palavra, original, p50 (ms)         | 1775  | 2022  | +248   | [+14, +503]                | 6     |
| atraso por palavra, original, p90 (ms)         | 3830  | 3837  | +8     | [−102, +491]               | 6     |
| atraso por palavra, tradução (proxy), p50 (ms) | 2535  | 2734  | +200   | [−59, +470]                | 6     |
| atraso por palavra, tradução (proxy), p90 (ms) | 4240  | 4261  | +20    | [−19, +195]                | 6     |
| erasure do original                            | 0.540 | 0.381 | −0.159 | [−0.208, −0.131]           | 8     |
| erasure da tradução (proxy)                    | 0.501 | 0.334 | −0.167 | [−0.270, −0.091]           | 8     |
| fimDaFalaAteLegendaMs p75 (ms)                 | 1233  | 1222  | −11    | [−52, +26]                 |       |
| fimDaFalaAteOriginalMs p75 (ms)                | 1154  | 1151  | −3     | [−38, +22]                 |       |
| 1º texto na tela (mediana das rodadas, ms)     | 1913  | 1906  | −7     | (sem IC: medida de rodada) |       |

Guardas do SLO (mediana das rodadas válidas):

| guarda                            | A       | B      | limite  | situação |
| --------------------------------- | ------- | ------ | ------- | -------- |
| framesLongos.n50                  | 0       | 0      | 5       | ok       |
| framesLongos.n100                 | 0       | 0      | 3       | ok       |
| framesLongos.somaMs               | 0       | 0      | 500     | ok       |
| cpuSilencio.processoPct           | 12.809  | 13.067 | 22.933  | ok       |
| rendersPorS.silencio              | 27.184  | 27.14  | 36.981  | ok       |
| rendersPorS.fala                  | 102.514 | 83.312 | 138.143 | ok       |
| fimDaFalaAteLegendaMs.taxaDeFalha | 0       | 0      | 0.15    | ok       |

Primária (atraso do original p50): efeito +13.9% sobre A; IC inteiro ACIMA de 0 (pior).

| guarda                                                                                   | situação | detalhe                                                                                                                 |
| ---------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------- |
| fimDaFalaAteLegendaMs p75                                                                | ok       | dif -11 ms, IC 95% [-51, 26], limite superior ≤ 100 ms                                                                  |
| erasureOriginal de B (V4: orçamento absoluto, média ≤ 0.5 e limite superior do IC ≤ 0.6) | ok       | B média 0.381, IC 95% de B [0.288, 0.504]; A 0.540, B − A -0.159 (IC [-0.208, -0.131], só informativo)                  |
| WER pareado do texto final (limite superior ≤ +2 pp)                                     | ok       | dif −0.1 pp, IC 95% [−1.5 pp, +1.2 pp], limite superior ≤ +2.0 pp                                                       |
| texto final fora do conjunto de A (informativo)                                          | ok       | 3 de 88 textos de B fora do conjunto de A (normalizado: 3); WER A 21.3%, B 21.2%; falas em que A varia entre rodadas: 5 |
| SLO framesLongos.n50                                                                     | ok       | A 0, B 0, limite 5                                                                                                      |
| SLO framesLongos.n100                                                                    | ok       | A 0, B 0, limite 3                                                                                                      |
| SLO framesLongos.somaMs                                                                  | ok       | A 0, B 0, limite 500                                                                                                    |
| SLO cpuSilencio.processoPct                                                              | ok       | A 12.809, B 13.067, limite 22.933                                                                                       |
| SLO rendersPorS.silencio                                                                 | ok       | A 27.184, B 27.14, limite 36.981                                                                                        |
| SLO rendersPorS.fala                                                                     | ok       | A 102.514, B 83.312, limite 138.143                                                                                     |
| SLO fimDaFalaAteLegendaMs.taxaDeFalha                                                    | ok       | A 0, B 0, limite 0.15                                                                                                   |

**Veredito: REPROVADO**
