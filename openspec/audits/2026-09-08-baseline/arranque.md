# arranque — 2026-09-08T22:06:27Z — 47ecf10
# comando: DATABASE_URL=file:<copia> AUTH_REQUIRED=0 NODE_ENV=production node scripts/perf/arranque.mjs --porta=3102 --execucoes=5
execução 1: 1806 ms
execução 2: 1334 ms
execução 3: 1350 ms
execução 4: 1312 ms
execução 5: 1331 ms

# arranque — node dist-server/server.cjs — 5 execuções — v24.18.0
mediana: 1334 ms | mínimo: 1312 ms | máximo: 1806 ms

## dev:local (tsx + vite middleware), informativo
execução 1: 3679 ms
execução 2: 3182 ms
execução 3: 3197 ms

# arranque — node node_modules/tsx/dist/cli.mjs server.ts — 3 execuções — v24.18.0
mediana: 3197 ms | mínimo: 3182 ms | máximo: 3679 ms
