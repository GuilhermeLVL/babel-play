### A/B dos parciais (v4) — A=atual.desktop (11 rodadas) × B=v5-pt.desktop (11 rodadas)

Bootstrap pareado por fala de 10000 reamostragens, semente 20261121, IC 95%.

| métrica                                        | A         | B         | B − A  | IC 95% da diferença        | falas |
| ---------------------------------------------- | --------- | --------- | ------ | -------------------------- | ----- |
| atraso por palavra, original, p50 (ms)         | 2553      | 1145      | −1408  | [−1618, −1113]             | 10    |
| atraso por palavra, original, p90 (ms)         | 4262      | 3077      | −1185  | [−1685, −887]              | 10    |
| atraso por palavra, tradução (proxy), p50 (ms) | —         | —         | —      | —                          | 0     |
| atraso por palavra, tradução (proxy), p90 (ms) | —         | —         | —      | —                          | 0     |
| erasure do original                            | 0.000     | 0.392     | +0.392 | [+0.261, +0.516]           | 12    |
| erasure da tradução (proxy)                    | undefined | undefined | —      | —                          | 0     |
| fimDaFalaAteLegendaMs p75                      | —         | —         | —      | —                          |       |
| fimDaFalaAteOriginalMs p75 (ms)                | 994       | 946       | −48    | [−114, +62]                |       |
| 1º texto na tela (mediana das rodadas, ms)     | 6286      | 3037      | −3249  | (sem IC: medida de rodada) |       |

Guardas do SLO (mediana das rodadas válidas):

| guarda                            | A      | B       | limite | situação   |
| --------------------------------- | ------ | ------- | ------ | ---------- |
| framesLongos.n50                  | 0      | 0       | 5      | ok         |
| framesLongos.n100                 | 0      | 0       | 3      | ok         |
| framesLongos.somaMs               | 0      | 0       | 500    | ok         |
| cpuSilencio.processoPct           | 13.792 | 14.077  | 24.309 | ok         |
| rendersPorS.silencio              | 22.906 | 22.906  | 31.632 | ok         |
| rendersPorS.fala                  | 57.298 | 109.088 | 81.622 | **piorou** |
| fimDaFalaAteLegendaMs.taxaDeFalha | —      | —       | —      | sem-medida |

Primária (atraso do original p50): efeito −55.2% sobre A; IC inteiro abaixo de 0 e efeito >= 20%.

| guarda                                                                                   | situação     | detalhe                                                                                                                |
| ---------------------------------------------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------- |
| fimDaFalaAteOriginalMs p75 (guarda 1 sem tradução)                                       | **reprovou** | dif -48 ms, IC 95% [-114, 62], limite superior ≤ 30 ms                                                                 |
| erasureOriginal de B (V4: orçamento absoluto, média ≤ 0.5 e limite superior do IC ≤ 0.6) | ok           | B média 0.392, IC 95% de B [0.261, 0.516]; A 0.000, B − A 0.392 (IC [0.261, 0.516], só informativo)                    |
| WER pareado do texto final (limite superior ≤ +2 pp)                                     | ok           | dif +0.3 pp, IC 95% [−0.4 pp, +1.2 pp], limite superior ≤ +2.0 pp                                                      |
| texto final fora do conjunto de A (informativo)                                          | ok           | 7 de 132 textos de B fora do conjunto de A (normalizado: 4); WER A 2.7%, B 3.0%; falas em que A varia entre rodadas: 3 |
| SLO framesLongos.n50                                                                     | ok           | A 0, B 0, limite 5                                                                                                     |
| SLO framesLongos.n100                                                                    | ok           | A 0, B 0, limite 3                                                                                                     |
| SLO framesLongos.somaMs                                                                  | ok           | A 0, B 0, limite 500                                                                                                   |
| SLO cpuSilencio.processoPct                                                              | ok           | A 13.792, B 14.077, limite 24.309                                                                                      |
| SLO rendersPorS.silencio                                                                 | ok           | A 22.906, B 22.906, limite 31.632                                                                                      |
| SLO rendersPorS.fala                                                                     | **reprovou** | A 57.298, B 109.088, limite 81.622                                                                                     |
| SLO fimDaFalaAteLegendaMs.taxaDeFalha                                                    | sem-medida   | A —, B —, limite —                                                                                                     |

**Veredito: REPROVADO** (guardas reprovadas: fimDaFalaAteOriginalMs p75 (guarda 1 sem tradução); SLO rendersPorS.fala)
