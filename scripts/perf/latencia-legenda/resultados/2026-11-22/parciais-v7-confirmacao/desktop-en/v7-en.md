### A/B dos parciais (v4) — A=atual.desktop (11 rodadas) × B=v7-en.desktop (11 rodadas)

Bootstrap pareado por fala de 10000 reamostragens, semente 20261121, IC 95%.

| métrica                                        | A     | B     | B − A  | IC 95% da diferença        | falas |
| ---------------------------------------------- | ----- | ----- | ------ | -------------------------- | ----- |
| atraso por palavra, original, p50 (ms)         | 1237  | 1873  | +636   | [−166, +1104]              | 6     |
| atraso por palavra, original, p90 (ms)         | 2692  | 3509  | +817   | [+44, +1116]               | 6     |
| atraso por palavra, tradução (proxy), p50 (ms) | 2285  | 2486  | +201   | [−160, +557]               | 6     |
| atraso por palavra, tradução (proxy), p90 (ms) | 4001  | 4021  | +20    | [−147, +321]               | 6     |
| erasure do original                            | 0.617 | 0.342 | −0.274 | [−0.492, −0.028]           | 8     |
| erasure da tradução (proxy)                    | 0.445 | 0.354 | −0.091 | [−0.294, +0.118]           | 8     |
| fimDaFalaAteLegendaMs p75 (ms)                 | 1019  | 968   | −51    | [−169, +32]                |       |
| fimDaFalaAteOriginalMs p75 (ms)                | 809   | 809   | +1     | [−6, +229]                 |       |
| 1º texto na tela (mediana das rodadas, ms)     | 3282  | 1430  | −1852  | (sem IC: medida de rodada) |       |

Guardas do SLO (mediana das rodadas válidas):

| guarda                            | A      | B      | limite  | situação |
| --------------------------------- | ------ | ------ | ------- | -------- |
| framesLongos.n50                  | 0      | 0      | 5       | ok       |
| framesLongos.n100                 | 0      | 0      | 3       | ok       |
| framesLongos.somaMs               | 0      | 0      | 500     | ok       |
| cpuSilencio.processoPct           | 13.34  | 13.759 | 23.676  | ok       |
| rendersPorS.silencio              | 22.919 | 22.919 | 31.649  | ok       |
| rendersPorS.fala                  | 90.572 | 76.094 | 123.215 | ok       |
| fimDaFalaAteLegendaMs.taxaDeFalha | 0      | 0      | 0.15    | ok       |

Primária (atraso do original p50): efeito +51.4% sobre A; IC cruza 0 ou efeito < 20%.

| guarda                                                                                   | situação | detalhe                                                                                                                 |
| ---------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------- |
| fimDaFalaAteLegendaMs p75                                                                | ok       | dif -51 ms, IC 95% [-169, 32], limite superior ≤ 100 ms                                                                 |
| erasureOriginal de B (V4: orçamento absoluto, média ≤ 0.5 e limite superior do IC ≤ 0.6) | ok       | B média 0.342, IC 95% de B [0.223, 0.455]; A 0.617, B − A -0.274 (IC [-0.492, -0.028], só informativo)                  |
| WER pareado do texto final (limite superior ≤ +2 pp)                                     | ok       | dif +0.0 pp, IC 95% [−1.5 pp, +1.3 pp], limite superior ≤ +2.0 pp                                                       |
| texto final fora do conjunto de A (informativo)                                          | ok       | 2 de 88 textos de B fora do conjunto de A (normalizado: 2); WER A 20.4%, B 20.4%; falas em que A varia entre rodadas: 5 |
| SLO framesLongos.n50                                                                     | ok       | A 0, B 0, limite 5                                                                                                      |
| SLO framesLongos.n100                                                                    | ok       | A 0, B 0, limite 3                                                                                                      |
| SLO framesLongos.somaMs                                                                  | ok       | A 0, B 0, limite 500                                                                                                    |
| SLO cpuSilencio.processoPct                                                              | ok       | A 13.34, B 13.759, limite 23.676                                                                                        |
| SLO rendersPorS.silencio                                                                 | ok       | A 22.919, B 22.919, limite 31.649                                                                                       |
| SLO rendersPorS.fala                                                                     | ok       | A 90.572, B 76.094, limite 123.215                                                                                      |
| SLO fimDaFalaAteLegendaMs.taxaDeFalha                                                    | ok       | A 0, B 0, limite 0.15                                                                                                   |

**Veredito: SEM DIFERENÇA PROVADA**
