### A/B dos parciais (v1) — A=atual.desktop (12 rodadas) × B=v1.desktop (12 rodadas)

Bootstrap pareado por fala de 10000 reamostragens, semente 20261121, IC 95%.

| métrica                                        | A         | B         | B − A | IC 95% da diferença        | falas |
| ---------------------------------------------- | --------- | --------- | ----- | -------------------------- | ----- |
| atraso por palavra, original, p50 (ms)         | 2575      | 2686      | +112  | [+2, +251]                 | 9     |
| atraso por palavra, original, p90 (ms)         | 4265      | 4441      | +176  | [−2, +318]                 | 9     |
| atraso por palavra, tradução (proxy), p50 (ms) | —         | —         | —     | —                          | 0     |
| atraso por palavra, tradução (proxy), p90 (ms) | —         | —         | —     | —                          | 0     |
| erasure do original                            | 0.000     | 0.000     | 0.000 | [0.000, 0.000]             | 11    |
| erasure da tradução (proxy)                    | undefined | undefined | —     | —                          | 0     |
| fimDaFalaAteLegendaMs p75                      | —         | —         | —     | —                          |       |
| 1º texto na tela (mediana das rodadas, ms)     | 6438      | 6342      | −97   | (sem IC: medida de rodada) |       |

Guardas do SLO (mediana das rodadas válidas):

| guarda                            | A      | B      | limite | situação   |
| --------------------------------- | ------ | ------ | ------ | ---------- |
| framesLongos.n50                  | 0      | 0      | 5      | ok         |
| framesLongos.n100                 | 0      | 0      | 3      | ok         |
| framesLongos.somaMs               | 0      | 0      | 500    | ok         |
| cpuSilencio.processoPct           | 12.291 | 12.147 | 22.207 | ok         |
| rendersPorS.silencio              | 22.906 | 22.906 | 31.632 | ok         |
| rendersPorS.fala                  | 56.837 | 56.911 | 81.046 | ok         |
| fimDaFalaAteLegendaMs.taxaDeFalha | —      | —      | —      | sem-medida |

Comparação informativa: sem veredito.
