### A/B de fimDaFalaAteLegendaMs — A=antes.desktop (12 rodadas) × B=depois.desktop (12 rodadas)

8 falas pareadas; bootstrap de 10000 reamostragens, semente 20261121.

| percentil | A (ms) | B (ms) | B − A (ms) | IC 95% da diferença (ms) |
| --------- | ------ | ------ | ---------- | ------------------------ |
| p50       | 867    | 870    | +3         | [−82, +163]              |
| p75       | 1015   | 999    | −16        | [−133, +107]             |
| p95       | 1460   | 1439   | −21        | [−115, +64]              |

Taxa de falha: A 0/96, B 0/96.

Guardas (mediana das rodadas válidas; limite = regra de `slo-captura.json` sobre A):

| guarda                            | A      | B      | limite  | situação |
| --------------------------------- | ------ | ------ | ------- | -------- |
| framesLongos.n50                  | 0      | 0      | 5       | ok       |
| framesLongos.n100                 | 0      | 0      | 3       | ok       |
| framesLongos.somaMs               | 0      | 0      | 500     | ok       |
| cpuSilencio.processoPct           | 13.89  | 13.862 | 24.446  | ok       |
| rendersPorS.silencio              | 22.919 | 22.919 | 31.649  | ok       |
| rendersPorS.fala                  | 91.938 | 91.114 | 124.922 | ok       |
| fimDaFalaAteLegendaMs.taxaDeFalha | 0      | 0      | 0.15    | ok       |

**Decisão (p75):** custo não descartado: limite superior do IC 95% do p75 (107 ms) > 5 ms

ENSAIO: o critério ainda não estava commitado; este resultado NÃO vale como decisão.
