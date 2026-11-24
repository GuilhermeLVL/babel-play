## Fase 1 — Mapeamento

- [x] Inventário, diagrama e tabela de fluxos (`openspec/audits/2026-09-25-prontidao/fase1-mapeamento.md`)
- [x] Reconferir os P0 novos à mão
- [x] GATE: aprovado em 25/09

## Fase 2 — Escala e isolamento

- [x] Tabela de capacidade 10/100/1.000/10.000 com hipótese de concorrência
- [x] ADR de banco (SQLite → ponto de virada)
- [x] Desenho da fila de IA (prioridade por plano, retry, idempotência)
- [x] Isolamento: simultaneidade por usuário, corpos em streaming, limites
- [x] Correções 1–5 e 7 aplicadas e medidas (fase2-escala.md §7)
- [x] Item 6: rotas caras (vocab, profile, gastar)
- [ ] Fila durável da importação na nuvem — continua aberta (RELATORIO-FINAL §2, "Ficaram abertos"; ADR 0007)
- [x] GATE: aprovado em 25/09

## Fase 3 — Custo

- [x] Modelo de custo por plano e patamar, com premissas — `scripts/custo/modelo.mjs` (premissas em `P`),
      `openspec/audits/2026-09-25-prontidao/fase3-custo.md`, `.csv` e `-tabelas.md` (conferido em 02/10; a matriz
      v2 regerou as tabelas em `openspec/changes/planos-v2/custo/`)
- [x] Feita e integrada (dono autorizou seguir sem gates em 25/09); ver RELATORIO-FINAL.md

## Fase 4 — Performance e carga

- [x] Suíte k6 com auth e IA simulada; rodar 10/100/1.000 — entregue em Node, NÃO em k6:
      `scripts/perf/suite/rodar.mjs` (`--vus=10,100,1000`, JWT de verdade, `provedor-falso.mjs` no lugar da IA),
      resultados em `fase4-carga.md` §2; o k6 que existe (`scripts/perf/carga.k6.js`) é o perfil antigo do
      saneamento (conferido em 02/10)
- [x] Lighthouse + budget; SLOs — `.github/workflows/lighthouse.yml` (manual) + `scripts/perf/frontend.mjs`;
      orçamento do bundle em `scripts/perf/orcamento-bundle.mjs` (job `carga` do CI); SLOs em
      `scripts/perf/suite/slo.json` e `docs/slo.md` (conferido em 02/10)
- [x] Feita e integrada (dono autorizou seguir sem gates em 25/09); ver RELATORIO-FINAL.md

## Fase 5 — Observabilidade e autoscaling

- [x] Feita e integrada (dono autorizou seguir sem gates em 25/09); ver RELATORIO-FINAL.md

## Fase 6 — Versionamento e distribuição

- [x] Feita e integrada (dono autorizou seguir sem gates em 25/09); ver RELATORIO-FINAL.md

## Fase 7 — Modo convidado

- [x] Feita e integrada (dono autorizou seguir sem gates em 25/09); ver RELATORIO-FINAL.md

## Fase 8 — Comunicação de planos

- [x] Feita e integrada (dono autorizou seguir sem gates em 25/09); ver RELATORIO-FINAL.md
