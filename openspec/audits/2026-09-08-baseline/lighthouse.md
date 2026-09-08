# Lighthouse 13.4.1 — 2026-09-08T22:14:49Z — 47ecf10 — servidor node dist-server/server.cjs (producao, build sem login) em 127.0.0.1:3101
# comando: npx lighthouse <url> [--preset=desktop] --only-categories=performance,accessibility,best-practices --chrome-flags="--headless=new"; mediana da nota de performance quando ha 3 execucoes

| preset | rota | exec. | perf | a11y | boas práticas | FCP ms | LCP ms | TBT ms | CLS | Speed Index |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| desktop | /capturar | 1 | 97 | 100 | 92 | 495 | 1198 | 0 | 0 | 1085 |
| desktop | / | 3 | 93 | 98 | 92 | 783 | 1592 | 10 | 0 | 1112 |
| desktop | /jogar | 3 | 70 | 95 | 92 | 493 | 1523 | 146 | 0.514 | 1097 |
| desktop | /loja | 1 | 88 | 96 | 92 | 778 | 2179 | 4 | 0 | 1164 |
| desktop | /perfil | 1 | 98 | 100 | 92 | 514 | 1022 | 3 | 0 | 1147 |
| desktop | /vocabulario | 1 | 97 | 99 | 92 | 500 | 1142 | 5 | 0 | 1260 |
| mobile | /capturar | 1 | 78 | 100 | 92 | 2264 | 5136 | 31 | 0 | 2684 |
| mobile | / | 3 | 82 | 98 | 92 | 2542 | 3893 | 186 | 0 | 2542 |
| mobile | /jogar | 3 | 26 | 90 | 92 | 2263 | 6699 | 1518 | 0.53 | 2864 |
| mobile | /loja | 1 | 75 | 96 | 92 | 2548 | 5092 | 178 | 0 | 2671 |
| mobile | /perfil | 1 | 73 | 100 | 92 | 2543 | 5678 | 167 | 0 | 2777 |
| mobile | /vocabulario | 1 | 66 | 99 | 92 | 2573 | 5955 | 306 | 0 | 3900 |
