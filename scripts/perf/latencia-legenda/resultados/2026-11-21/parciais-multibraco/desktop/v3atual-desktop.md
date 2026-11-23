### A/B dos parciais (v3) — A=atual.desktop (12 rodadas) × B=v1v3.desktop (12 rodadas)

Bootstrap pareado por fala de 10000 reamostragens, semente 20261121, IC 95%.

| métrica                                        | A     | B     | B − A  | IC 95% da diferença        | falas |
| ---------------------------------------------- | ----- | ----- | ------ | -------------------------- | ----- |
| atraso por palavra, original, p50 (ms)         | 1265  | 265   | −1001  | [−1201, −820]              | 6     |
| atraso por palavra, original, p90 (ms)         | 2683  | 2338  | −345   | [−1565, +210]              | 6     |
| atraso por palavra, tradução (proxy), p50 (ms) | 2073  | 2692  | +619   | [+169, +1016]              | 6     |
| atraso por palavra, tradução (proxy), p90 (ms) | 4028  | 4074  | +46    | [−32, +333]                | 6     |
| erasure do original                            | 0.587 | 3.553 | +2.966 | [+2.616, +3.353]           | 8     |
| erasure da tradução (proxy)                    | 0.496 | 0.121 | −0.375 | [−0.632, −0.141]           | 8     |
| fimDaFalaAteLegendaMs p75 (ms)                 | 1016  | 1021  | +6     | [−19, +170]                |       |
| 1º texto na tela (mediana das rodadas, ms)     | 3194  | 1020  | −2174  | (sem IC: medida de rodada) |       |

Guardas do SLO (mediana das rodadas válidas):

| guarda                            | A      | B       | limite  | situação   |
| --------------------------------- | ------ | ------- | ------- | ---------- |
| framesLongos.n50                  | 0      | 0       | 5       | ok         |
| framesLongos.n100                 | 0      | 0       | 3       | ok         |
| framesLongos.somaMs               | 0      | 0       | 500     | ok         |
| cpuSilencio.processoPct           | 12.94  | 13.215  | 23.115  | ok         |
| rendersPorS.silencio              | 22.919 | 22.919  | 31.649  | ok         |
| rendersPorS.fala                  | 90.93  | 203.229 | 123.662 | **piorou** |
| fimDaFalaAteLegendaMs.taxaDeFalha | 0      | 0       | 0.15    | ok         |

Comparação informativa: sem veredito.
