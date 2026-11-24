### A/B de fimDaFalaAteLegendaMs — A=antes.desktop (12 rodadas) × B=depois.desktop (12 rodadas)

8 falas pareadas; bootstrap de 10000 reamostragens, semente 20261121.

| percentil | A (ms) | B (ms) | B − A (ms) | IC 95% da diferença (ms) |
|---|---|---|---|---|
| p50 | 868 | 871 | +3 | [−165, +373] |
| p75 | 1017 | 970 | −47 | [−164, +164] |
| p95 | 1463 | 1412 | −51 | [−162, +16] |

Taxa de falha: A 0/96, B 0/96.

Guardas (mediana das rodadas válidas; limite = regra de `slo-captura.json` sobre A):

| guarda | A | B | limite | situação |
|---|---|---|---|---|
| framesLongos.n50 | 0 | 0 | 5 | ok |
| framesLongos.n100 | 0 | 0 | 3 | ok |
| framesLongos.somaMs | 0 | 0 | 500 | ok |
| cpuSilencio.processoPct | 12.899 | 12.985 | 23.058 | ok |
| rendersPorS.silencio | 22.919 | 22.919 | 31.649 | ok |
| rendersPorS.fala | 90.128 | 102.893 | 122.66 | ok |
| fimDaFalaAteLegendaMs.taxaDeFalha | 0 | 0 | 0.15 | ok |

**Decisão (p75):** sem diferença provada: o IC 95% do p75 cruza 0
