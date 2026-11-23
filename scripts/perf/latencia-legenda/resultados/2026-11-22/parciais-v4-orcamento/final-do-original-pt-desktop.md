### A/B dos parciais (v4) — A=atual.desktop (11 rodadas) × B=v4-pt.desktop (11 rodadas)

Bootstrap pareado por fala de 10000 reamostragens, semente 20261121, IC 95%.

| métrica                                        | A         | B         | B − A  | IC 95% da diferença        | falas |
| ---------------------------------------------- | --------- | --------- | ------ | -------------------------- | ----- |
| atraso por palavra, original, p50 (ms)         | 2641      | 1618      | −1023  | [−1324, −512]              | 10    |
| atraso por palavra, original, p90 (ms)         | 4404      | 4366      | −38    | [−631, +291]               | 10    |
| atraso por palavra, tradução (proxy), p50 (ms) | —         | —         | —      | —                          | 0     |
| atraso por palavra, tradução (proxy), p90 (ms) | —         | —         | —      | —                          | 0     |
| erasure do original                            | 0.000     | 0.209     | +0.209 | [+0.120, +0.306]           | 12    |
| erasure da tradução (proxy)                    | undefined | undefined | —      | —                          | 0     |
| fimDaFalaAteLegendaMs p75                      | —         | —         | —      | —                          |       |
| fimDaFalaAteOriginalMs p75 (ms)                | 951       | 1148      | +198   | [+54, +445]                |       |
| 1º texto na tela (mediana das rodadas, ms)     | 6407      | 3216      | −3191  | (sem IC: medida de rodada) |       |

Guardas do SLO (mediana das rodadas válidas):

| guarda                            | A      | B      | limite | situação   |
| --------------------------------- | ------ | ------ | ------ | ---------- |
| framesLongos.n50                  | 0      | 0      | 5      | ok         |
| framesLongos.n100                 | 0      | 0      | 3      | ok         |
| framesLongos.somaMs               | 0      | 0      | 500    | ok         |
| cpuSilencio.processoPct           | 10.647 | 10.886 | 19.906 | ok         |
| rendersPorS.silencio              | 22.906 | 22.906 | 31.632 | ok         |
| rendersPorS.fala                  | 56.837 | 57.664 | 81.046 | ok         |
| fimDaFalaAteLegendaMs.taxaDeFalha | —      | —      | —      | sem-medida |

Primária (atraso do original p50): efeito −38.7% sobre A; IC inteiro abaixo de 0 e efeito >= 20%.

| guarda                                                                                   | situação     | detalhe                                                                                                                |
| ---------------------------------------------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------- |
| fimDaFalaAteOriginalMs p75 (guarda 1 sem tradução)                                       | **reprovou** | dif 198 ms, IC 95% [54, 445], limite superior ≤ 30 ms                                                                  |
| erasureOriginal de B (V4: orçamento absoluto, média ≤ 0.5 e limite superior do IC ≤ 0.6) | ok           | B média 0.209, IC 95% de B [0.120, 0.306]; A 0.000, B − A 0.209 (IC [0.120, 0.306], só informativo)                    |
| WER pareado do texto final (limite superior ≤ +2 pp)                                     | ok           | dif +0.1 pp, IC 95% [−0.8 pp, +0.9 pp], limite superior ≤ +2.0 pp                                                      |
| texto final fora do conjunto de A (informativo)                                          | ok           | 2 de 131 textos de B fora do conjunto de A (normalizado: 2); WER A 3.0%, B 3.1%; falas em que A varia entre rodadas: 7 |
| SLO framesLongos.n50                                                                     | ok           | A 0, B 0, limite 5                                                                                                     |
| SLO framesLongos.n100                                                                    | ok           | A 0, B 0, limite 3                                                                                                     |
| SLO framesLongos.somaMs                                                                  | ok           | A 0, B 0, limite 500                                                                                                   |
| SLO cpuSilencio.processoPct                                                              | ok           | A 10.647, B 10.886, limite 19.906                                                                                      |
| SLO rendersPorS.silencio                                                                 | ok           | A 22.906, B 22.906, limite 31.632                                                                                      |
| SLO rendersPorS.fala                                                                     | ok           | A 56.837, B 57.664, limite 81.046                                                                                      |
| SLO fimDaFalaAteLegendaMs.taxaDeFalha                                                    | sem-medida   | A —, B —, limite —                                                                                                     |

**Veredito: REPROVADO** (guardas reprovadas: fimDaFalaAteOriginalMs p75 (guarda 1 sem tradução))
