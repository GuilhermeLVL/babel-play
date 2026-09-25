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
- [ ] Item 6: rotas caras (vocab, profile, gastar)
- [ ] Fila durável da importação na nuvem
- [x] GATE: aprovado em 25/09

## Fase 3 — Custo

- [ ] Modelo de custo por plano e patamar, com premissas
- [ ] GATE

## Fase 4 — Performance e carga

- [ ] Suíte k6 com auth e IA simulada; rodar 10/100/1.000
- [ ] Lighthouse + budget; SLOs
- [ ] GATE

## Fase 5 — Observabilidade e autoscaling

- [ ] GATE

## Fase 6 — Versionamento e distribuição

- [ ] GATE

## Fase 7 — Modo convidado

- [ ] GATE

## Fase 8 — Comunicação de planos

- [ ] GATE
