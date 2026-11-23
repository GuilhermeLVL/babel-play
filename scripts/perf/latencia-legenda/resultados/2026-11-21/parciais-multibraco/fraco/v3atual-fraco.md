### A/B dos parciais (v3) — A=atual.fraco (12 rodadas) × B=v1v3.fraco (12 rodadas)

Bootstrap pareado por fala de 10000 reamostragens, semente 20261121, IC 95%.

| métrica                                        | A     | B     | B − A  | IC 95% da diferença        | falas |
| ---------------------------------------------- | ----- | ----- | ------ | -------------------------- | ----- |
| atraso por palavra, original, p50 (ms)         | 1650  | 1530  | −120   | [−291, +73]                | 6     |
| atraso por palavra, original, p90 (ms)         | 3707  | 3706  | −2     | [−215, +615]               | 6     |
| atraso por palavra, tradução (proxy), p50 (ms) | 2456  | 3079  | +623   | [+175, +1044]              | 6     |
| atraso por palavra, tradução (proxy), p90 (ms) | 4264  | 4432  | +168   | [+15, +247]                | 6     |
| erasure do original                            | 0.508 | 0.556 | +0.048 | [+0.000, +0.107]           | 8     |
| erasure da tradução (proxy)                    | 0.456 | 0.000 | −0.456 | [−0.662, −0.283]           | 8     |
| fimDaFalaAteLegendaMs p75 (ms)                 | 1214  | 1399  | +185   | [+17, +202]                |       |
| 1º texto na tela (mediana das rodadas, ms)     | 1920  | 1875  | −46    | (sem IC: medida de rodada) |       |

Guardas do SLO (mediana das rodadas válidas):

| guarda                            | A       | B       | limite  | situação |
| --------------------------------- | ------- | ------- | ------- | -------- |
| framesLongos.n50                  | 0       | 0       | 5       | ok       |
| framesLongos.n100                 | 0       | 0       | 3       | ok       |
| framesLongos.somaMs               | 0       | 0       | 500     | ok       |
| cpuSilencio.processoPct           | 13.326  | 13.224  | 23.656  | ok       |
| rendersPorS.silencio              | 27.166  | 27.192  | 36.957  | ok       |
| rendersPorS.fala                  | 102.081 | 103.728 | 137.601 | ok       |
| fimDaFalaAteLegendaMs.taxaDeFalha | 0       | 0       | 0.15    | ok       |

Comparação informativa: sem veredito.
