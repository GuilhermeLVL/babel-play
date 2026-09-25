# Prontidão para produção — Fase 5: observabilidade e autoscaling (25/09/2026)

Branch `feat/observabilidade` (worktree `.claude/worktrees/fx-observabilidade`, a partir de
`auditoria/prontidao-producao`). O dono autorizou seguir sem gate de aprovação.

## 0. Lacunas herdadas (Fase 1/2) e como ficaram

| Lacuna | Situação agora |
|---|---|
| Métricas não coletadas em produção | **Fechada no código**: `[metrics]` no `fly.toml` na porta interna 9091, `METRICS_ENABLED=1` no `[env]`. Falta o dono conferir no fly-metrics.net depois do próximo deploy (§6) |
| Sem alerta de latência, taxa de erro, event loop | `ops/alertas/regras.yml`: `BabelErros5xxAltos`, `BabelLatenciaP95Alta`, `BabelEventLoopTravado` |
| Sem custo de IA diário | teto `AI_BUDGET_USD_DAY` (80% avisa, 100% fecha até 00:00 UTC) + gauge `ia_gasto_usd{periodo}` + `BabelGastoDiarioAlto` |
| 429 do provedor só como warn no Sentry | `BabelProvedorIaLimitando` sobre `ia_provedor_limite_total` |
| Gasto anômalo por usuário | vigia por usuário (teto absoluto e N× mediana), warn `ia_gasto_anomalo_usuario` com pseudônimo, `ia_gasto_anomalo_usuario_total`, `BabelGastoAnomaloUsuario` |
| Sem dashboard de custo por plano | `ia_custo_usd_total{plano}` + `ops/dashboards/babel-play.json` (linha "Custo de IA") |
| Sem critérios de escala | `docs/escala.md` com limiares numéricos, custos e comandos; alertas `BabelEscala*` a 70% dos gatilhos |

## 1. Coleta no Fly — decisão e justificativa

**Doc consultada em 25/09/2026** ([fly.io/docs/monitoring/metrics](https://fly.io/docs/monitoring/metrics/)):
o bloco é `[metrics]` com `port` e `path`; o Fly raspa **a cada 15 s** e guarda **~15 dias** no Prometheus
gerenciado (VictoriaMetrics, consultas em MetricsQL); **não há campo de autenticação** no bloco, e a doc
manda expor em `0.0.0.0`. Também diz que o Fly **não tem alerta embutido** sobre métricas (Grafana ou
Prometheus+Alertmanager próprios).

**Escolha: porta interna sem token, porta pública sem `/metrics`.**
- `METRICS_PORTA_INTERNA=9091` sobe um listener `node:http` só com `GET /metrics` (sem token), apenas no
  processo primário. O `[metrics]` aponta para ele.
- Com a porta interna definida, a porta pública **não monta** `/metrics` (404 como qualquer caminho): menos
  superfície que um token.
- O que protege a 9091 é não estar publicada: o proxy do Fly só encaminha portas de `[http_service]`/
  `[[services]]`. `tests/integration/alertas-e-painel.test.ts` falha se alguém publicar essa porta.
- Alternativa recusada: manter o token e raspar com um agente próprio (Grafana Agent/vmagent numa segunda
  máquina) — custa uma VM a mais e uma credencial a mais para o mesmo resultado.
- Regra de boot atualizada (`erroDeMetricasEmProducao`): em produção, `METRICS_ENABLED=1` exige
  `METRICS_TOKEN` **ou** `METRICS_PORTA_INTERNA`; porta inválida ou igual a `PORT` aborta o boot.
- Efeito colateral bom: resolve o "scrape alternando de processo" do cluster descrito em `metricas.ts`
  (o listener só existe no primário). Limite declarado: com `CLUSTER_WORKERS>1`, a porta interna mostra
  só o primário.

## 2. Métricas novas (`server/http/metricas.ts`)

| Métrica | Tipo | De onde |
|---|---|---|
| `event_loop_atraso_segundos` | histograma | `monitorEventLoopDelay` (resolução 20 ms) convertido em observações a cada scrape, com a resolução descontada (ocioso ≈ 0) |
| `db_escritas_total`, `db_leituras_total`, `db_consulta_duracao_segundos{tipo}` | contador / histograma | `client.execute`/`client.batch` do libsql embrulhados (`server/db/observadorDeConsultas.ts`); classificação pela 1ª palavra do SQL. Transações (`emTransacao`) ficam de fora |
| `db_tamanho_bytes` | gauge (no scrape) | `stat` do arquivo + WAL |
| `ia_gasto_usd{periodo=dia\|mes}`, `ia_orcamento_teto_usd{periodo}` | gauge (no scrape) | `gasto_de_ia`; teto infinito não é emitido (um `+Inf` quebraria a razão do alerta) |
| `ia_custo_usd_total{plano}` | contador | somado em `registrarGastoDeIa` (MT, tutor, STT), plano da allowlist `free/essencial/pro/selfhost`, senão `desconhecido` |
| `ia_gasto_anomalo_usuario_total{motivo}` | contador | vigia por usuário |
| `ia_disjuntores{estado}` | gauge (no scrape) | contagem por estado — nunca a chave, que tem URL (BYOK = série por usuário) |
| `uploads_grandes_em_voo`, `uploads_grandes_limite`, `uploads_grandes_recusados_total{motivo}` | gauge / contador | semáforo de `corposGrandes.ts` |
| `ia_cache_traducao_total{resultado}`, `ia_cache_traducao_entradas` | contador / gauge | `mtProxy.ts` e o cache |
| `backup_ultimo_sucesso_timestamp_segundos`, `backup_ultimo_tamanho_bytes`, `backup_falhas_total` | gauge / contador | `agendarSnapshotDiario` (injetado pelo `server.ts` para a CLI não puxar o prom-client) |

Tudo continua preguiçoso: com `METRICS_ENABLED` desligado nada é registrado, o monitor do loop não liga e
o embrulho do libsql custa um `if`.

## 3. Orçamento diário e gasto anômalo

- **`AI_BUDGET_USD_DAY`** (declarada em `config.ts`): mesma lógica do mensal, reaproveitada numa função
  `somarNoPeriodo`. O dia mora na **mesma tabela** `gasto_de_ia` com chave `AAAA-MM-DD` (sem migração; a
  aritmética atômica e os marcadores de 80%/100% são idênticos). Eventos `ia_orcamento_diario_alerta_80`
  (warn, vai ao Sentry) e `ia_orcamento_diario_esgotado` (error); portão `orcamento_diario_esgotado` com
  "volta amanhã (00:00 UTC)". O dia é somado mesmo sem teto (alimenta o painel). Ausente = sem teto
  diário (não muda o comportamento de quem já opera); `.env.production.example` sugere `4` (≈ mensal ÷ 10).
- **Gasto anômalo** (`server/lib/gastoAnomalo.ts`): por usuário, por dia UTC, em memória do processo.
  Dispara se passar de `AI_USUARIO_ALERTA_USD_DIA` (padrão US$ 0,50) ou de `AI_USUARIO_ALERTA_FATOR`× a
  mediana (padrão 10×, só com ≥ 5 usuários no dia). Uma vez por usuário/dia/motivo. Não bloqueia.
- **Pseudonimização:** `server/lib/pseudonimoDeUsuario.ts` extrai o sal/HMAC que estava em
  `telemetriaDeIa.ts`; o `u_…` do alerta é **o mesmo** do Langfuse (teste prova). O id real não aparece
  no log (teste prova). Campos `usuario`/`medianaUsd` entraram na allowlist do logger.

## 4. Alertas, painel e escala como código

- `ops/alertas/regras.yml` — 18 regras em 5 grupos (http, ia, custo, recursos, escala), `summary` e
  `description` em pt-BR, `severity` `pagina`/`aviso`/`planejamento`, `runbook_url` para âncoras do runbook.
- `ops/dashboards/babel-play.json` — Grafana (uid `babel-play-prod`, data source parametrizado), 35 painéis
  em 5 linhas: HTTP (req/s, erros, taxa de 5xx, p50/p95/p99 por rota), processo e máquina (event loop, RSS,
  CPU, saldo de rajada, banco), IA (chamadas, latência, 429, admissão, saldo, disjuntores, cache), custo
  (dia, mês, % do teto, por plano, por provedor, anomalias), uploads e backup.
- `docs/escala.md` — a escada shared-cpu-1x → performance-1x → memória → performance-2x → Postgres +
  réplicas (ADR 0006), com limiares numéricos da Fase 2, custo de tabela do Fly e comandos
  (`fly scale vm`, `fly scale memory`); por que **não** usar auto-stop nem `scale count` com SQLite.
- `docs/runbook.md` — §3 (métricas no Fly), §11 atualizado e **§13: uma seção por alerta** (significado,
  primeira ação, como silenciar).

## 5. Evidências (gates)

| Gate | Resultado |
|---|---|
| `tsc --noEmit` | 0 erros |
| `eslint src server server.ts tests --max-warnings 0` | 0 |
| `npm run workflows:validar` | todos OK |
| `madge --circular` | nenhum ciclo |
| vitest completo `--maxWorkers=3` | ver §5.1 |

Testes novos: `tests/gasto-anomalo.test.ts` (6), `tests/integration/metricas-fase5.test.ts` (11 — inclui um
bloqueio real de 600 ms visto acima do balde de 0,5 s, escritas contadas no libsql e a porta interna
respondendo sem token com `METRICS_TOKEN` definida), `tests/integration/alertas-e-painel.test.ts` (10 — YAML
válido, toda métrica citada existe, âncoras do runbook existem, `fly.toml` não publica a porta), e casos
novos em `orcamento-de-ia.test.ts` (6) e `metricas-producao-fail-closed.test.ts` (5).

### 5.1 Suíte completa

`vitest run --maxWorkers=3`: **449 arquivos, 4.708 testes — 4.698 passaram, 2 pulados, 8 falharam**, todos
fora do escopo desta fase:

- 6 falhas de AMBIENTE conhecidas (sobem subprocesso com `tsx` a partir da worktree): `cluster.test.ts` (2),
  `desligamento-gracioso.test.ts` (3), `teto-de-erros-entre-instancias.test.ts` (1).
- `telasDePagamento.test.tsx` (1): intermitente sob carga; passa isolado (13/13).
- `config-inventario.test.ts` (1, ordem alfabética): **corrigido** (`METRICS_PORTA_INTERNA` antes de
  `METRICS_TOKEN`) e reexecutado — 7/7.

## 6. Pendências do dono

1. **Deploy e conferência da coleta:** depois do próximo deploy, abrir o fly-metrics.net → Explore e
   consultar `processo_info{app="babel-play"}`; se vier vazio, `fly ssh console -C "wget -qO- http://127.0.0.1:9091/metrics"`.
2. **Grafana com alerta:** o Grafana gerenciado do Fly é para painéis; para **alertas** use um Grafana com
   Alerting (Grafana Cloud grátis serve) com o data source `https://api.fly.io/prometheus/<org>/` e header
   `Authorization: FlyV1 <token>` de um token **read-only** (`fly tokens create readonly`). Importar
   `ops/dashboards/babel-play.json` e recriar as regras de `ops/alertas/regras.yml`.
3. **Rota de notificação (contact point):** e-mail do dono para `severity=pagina` e `aviso`; `planejamento`
   pode ir só para e-mail semanal. Sem isto as regras existem e ninguém é avisado.
4. **Sentry:** incluir `ia_orcamento_diario_alerta_80`, `ia_orcamento_diario_esgotado` e
   `ia_gasto_anomalo_usuario` na regra de alerta que hoje filtra `ia_orcamento_*` (runbook §0.5).
5. **Decidir `AI_BUDGET_USD_DAY`** (o exemplo sugere 4 para um mensal de 40) e defini-la como secret/env.
6. **Ajustar limiares** depois de uma semana de dados reais (p95, admissão, memória) — os de agora vêm da
   medição da Fase 2, não de tráfego real.

## 7. Limites e o que ficou de fora

- Métricas dentro de `emTransacao` (conexão nova do libsql) não entram em `db_*`.
- Com cluster, a porta interna mostra só o primário (declarado no corpo do scrape).
- O vigia de gasto por usuário é por processo e zera no deploy — perde, no máximo, o alerta do dia.
- O histograma do event loop tem a resolução do `monitorEventLoopDelay` (20 ms) e o primeiro intervalo após
  cada scrape não é registrado pelo HDR do Node — bloqueios de centenas de ms são vistos (teste), atrasos
  de poucos ms não são o objetivo.
- Não há tracing distribuído (runbook §11).
