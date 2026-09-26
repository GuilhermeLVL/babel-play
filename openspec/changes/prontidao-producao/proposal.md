## Why

O Babel Play funciona para 1 usuário. Antes de abrir ao público, precisa aguentar 10, 100, 1.000 e 10.000 usuários
sem cair, sem estourar custo e com capacidade ajustável. O mapeamento da Fase 1
(`openspec/audits/2026-09-25-prontidao/fase1-mapeamento.md`) achou 7 P0: um usuário derruba a única máquina por
memória, a cota de STT é forjável, o cliente escolhe o modelo pago, a IA aguenta 2–4 falantes simultâneos, o deploy
não depende do CI, não há alerta nem coleta de métricas, e a API não tem 404 JSON nem versão.

## What Changes

Auditoria e correção em 8 fases, cada uma com relatório e gate de aprovação do dono:

1. Mapeamento (feito).
2. Escala e isolamento: capacidade por patamar, ADR de banco, fila de IA, degradação no 429, estado entre réplicas.
3. Custo: modelo por usuário e plano nos 4 patamares, limites do free e do convidado, cache de IA.
4. Performance: suíte k6 versionada com auth, p50/p95/p99, ponto de quebra, Lighthouse, SLOs no CI.
5. Observabilidade e autoscaling: alertas mínimos, critérios de escala, custo por plano.
6. Versionamento e distribuição: semver, versão na UI e na API, flags, gate de CI no deploy, rollback, restauração.
7. Modo convidado: estender o modo anônimo local com cota de nuvem pequena e antiabuso.
8. Comunicação de planos: gatilhos, componentes, frequency capping, configuração remota, métricas de conversão.

## Non-Goals

- Upgrade da Groq para Developer (indisponível): vira restrição de projeto e pendência.
- Reabrir os P0 antigos (cota, concorrência SQLite, áudio por réplica): só verificação de regressão.

## Impact

`server/**`, `src/**`, `fly.toml`, `.github/workflows/**`, `docs/adr/**`, `scripts/perf/**`.
