# latencia — http://127.0.0.1:3101 — 10 conexoes, 15s por rota, 2026-09-08T22:02:20.806Z, v24.18.0

| rota | p50 ms | p95 ms | p99 ms | req/s | não-2xx | erros |
|---|---:|---:|---:|---:|---:|---:|
| GET /api/health | 2 | 2 | 4 | 4399 | 0 | 0 |
| GET /api/me | 4 | 7 | 8 | 1986 | 0 | 0 |
| GET /api/metrics/profile | 354 | 372 | 549 | 28 | 0 | 0 |
| GET /api/metrics/xp | 14 | 15 | 16 | 691 | 0 | 0 |
| GET /api/exercises/recordes | 7 | 8 | 9 | 1382 | 0 | 0 |
| GET /api/vocab/para-jogo | 40 | 41 | 45 | 247 | 0 | 0 |
| GET /api/vocab (deck inteiro) | 991 | 1576 | 1779 | 9 | 0 | 0 |
| GET /api/sessions | 4 | 6 | 6 | 2241 | 0 | 0 |
| GET /api/exercises/results | 37 | 39 | 39 | 266 | 0 | 0 |
| GET /api/rank/termo | 2 | 3 | 4 | 4141 | 0 | 0 |
| POST /api/exercises/rodada | 27 | 38 | 39 | 364 | 0 | 0 |
| POST /api/vocab/:id/review (FSRS) | 14 | 20 | 23 | 669 | 0 | 0 |
