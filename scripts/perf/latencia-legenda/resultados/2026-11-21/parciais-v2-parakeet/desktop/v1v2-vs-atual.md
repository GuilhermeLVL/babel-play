### A/B dos parciais (v1) — A=atual.desktop (12 rodadas) × B=v1v2.desktop (12 rodadas)

Bootstrap pareado por fala de 10000 reamostragens, semente 20261121, IC 95%.

| métrica                                        | A         | B         | B − A  | IC 95% da diferença        | falas |
| ---------------------------------------------- | --------- | --------- | ------ | -------------------------- | ----- |
| atraso por palavra, original, p50 (ms)         | 2575      | 799       | −1776  | [−2023, −1326]             | 9     |
| atraso por palavra, original, p90 (ms)         | 4265      | 4165      | −100   | [−763, +258]               | 9     |
| atraso por palavra, tradução (proxy), p50 (ms) | —         | —         | —      | —                          | 0     |
| atraso por palavra, tradução (proxy), p90 (ms) | —         | —         | —      | —                          | 0     |
| erasure do original                            | 0.000     | 0.723     | +0.723 | [+0.508, +0.971]           | 11    |
| erasure da tradução (proxy)                    | undefined | undefined | —      | —                          | 0     |
| fimDaFalaAteLegendaMs p75                      | —         | —         | —      | —                          |       |
| 1º texto na tela (mediana das rodadas, ms)     | 6438      | 1765      | −4673  | (sem IC: medida de rodada) |       |

Guardas do SLO (mediana das rodadas válidas):

| guarda                            | A      | B       | limite | situação   |
| --------------------------------- | ------ | ------- | ------ | ---------- |
| framesLongos.n50                  | 0      | 0       | 5      | ok         |
| framesLongos.n100                 | 0      | 0       | 3      | ok         |
| framesLongos.somaMs               | 0      | 0       | 500    | ok         |
| cpuSilencio.processoPct           | 12.291 | 11.331  | 22.207 | ok         |
| rendersPorS.silencio              | 22.906 | 22.906  | 31.632 | ok         |
| rendersPorS.fala                  | 56.837 | 134.238 | 81.046 | **piorou** |
| fimDaFalaAteLegendaMs.taxaDeFalha | —      | —       | —      | sem-medida |

Comparação informativa: sem veredito.
