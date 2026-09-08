# recuperacao apos kill -9 sob carga — 2026-09-08T22:07:15Z — 47ecf10 — supervisor em processo (papel do restart: unless-stopped)
# comando: NODE_ENV=production node scripts/perf/recuperacao.mjs --db=<copia> --porta=3104 --carga=30 --matar=10
# recuperacao — 2026-09-08T22:07:16.778Z — v24.18.0
boot inicial: 1345 ms; exercise_results antes: 198
kill -9 no pid 22352 aos 10s; health 200 de novo em 1405 ms (reinícios: 1)

| métrica | valor |
|---|---:|
| requisições 2xx (cliente viu sucesso) | 27398 |
| não-2xx | 0 |
| erros de conexão (cortadas no kill) | 6903 |
| linhas novas em exercise_results | 27408 |
| 2xx sem linha (PERDA) | 0 |
| linhas sem 2xx (cortadas, aceitável) | 10 |
| tempo até health 200 após kill | 1405 ms |
| integrity_check | ok |

## com CLUSTER_WORKERS=2 (primario refaz o worker)
# recuperacao — 2026-09-08T22:07:49.749Z — v24.18.0
boot inicial: 1500 ms; exercise_results antes: 198
kill -9 no pid 30128 aos 10s; health 200 de novo em 1556 ms (reinícios: 1)

| métrica | valor |
|---|---:|
| requisições 2xx (cliente viu sucesso) | 26466 |
| não-2xx | 0 |
| erros de conexão (cortadas no kill) | 7637 |
| linhas novas em exercise_results | 26476 |
| 2xx sem linha (PERDA) | 0 |
| linhas sem 2xx (cortadas, aceitável) | 10 |
| tempo até health 200 após kill | 1556 ms |
| integrity_check | ok |
