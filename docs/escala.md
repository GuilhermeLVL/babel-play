# Critérios de escala — quando e como crescer (Fase 5 de prontidão, 25/09/2026)

> **Desde o ADR 0015** a produção é o Worker da Cloudflare com Postgres no Supabase: a escada abaixo é de **CPU por
> requisição do Worker** e de **conexões Hyperdrive/Supabase**, não de tamanho de máquina. As medições anteriores
> (Fases 2 e 4, "medido no Node em set/2026") ficam como histórico e como referência do self-host; elas foram
> feitas num Node de um núcleo compartilhado com SQLite e **não valem para o Worker**.

Este documento responde **"a métrica X disparou; qual é o próximo passo, quanto custa e qual o comando?"**.
Os limiares históricos vêm das medições da Fase 2 (`openspec/audits/2026-09-25-prontidao/fase2-escala.md`); os do
Worker, do staging (`docs/auditoria/2026-10-20-fase4-staging.md`). No Worker as métricas saem para o Analytics
Engine (`docs/runbook.md` §3.1) e para o painel de Workers da Cloudflare; as de `server/http/metricas.ts` e os
alertas de `ops/alertas/regras.yml` valem para o self-host em Node.

## O que a Fase 2 mediu no Node, em set/2026 (e decide a ordem no self-host)

- Um núcleo compartilhado sustentava **6,25 % de um núcleo**; acima disso gastava um saldo de rajada (até ~500 s) e
  depois era **estrangulado**.
- Demanda estimada no pico: **0,000274 × cadastrados núcleos** (100 → 44 % da base; 1.000 → 4,4× a base) e
  **~0,076 × cadastrados escritas/s**.
- **Até ~1.000 cadastrados a CPU quebra antes do banco.** O SQLite de escritor único deixava de bastar entre
  1.000 e 2.000 cadastrados (teto ~80–160 escritas/s sustentadas); o Postgres removeu esse teto.
- RSS: 290–300 MB em repouso, 470–590 MB sob carga; 2 uploads grandes simultâneos ≈ +340 MB.
- Banco: ~3,9 MB por usuário pesado; o volume era limitado a 10 GB (o Postgres do Supabase tem o seu próprio disco).

## O que a Fase 4 mediu depois das correções (suíte de carga, `openspec/audits/2026-09-25-prontidao/fase4-carga.md`)

Usuários virtuais com ritmo de gente e a mistura realista (`scripts/perf/suite/rodar.mjs`; SLOs em `docs/slo.md`):

- **0,038 % de um núcleo por usuário simultâneo** (+ 0,8 % de repouso); **0,122 req/s** e **0,037 escritas/s** por
  usuário simultâneo; RSS 316 MB com 100, 426 MB com 1.000, 669 MB com 2.000.
- Numa máquina local, dentro do SLO até **1.000 simultâneos** (p95 21 ms, 0 erro, CPU 39 %); **quebra com 2.000**
  (p95 334 ms, CPU 72 %: o joelho de um event loop).
- **No núcleo compartilhado: ~94 simultâneos dentro do SLO, ~143 no limite da cota** (≈ 1.000 cadastrados com 10 %
  simultâneos) — a demanda estimada da Fase 2 (0,000274 × cadastrados) caiu para \*\*~0,000038 núcleo × cadastrados
  - repouso\*\*, ~7× menos, depois das rotas caras e da admissão de IA.
- Num núcleo dedicado: ~1.800 simultâneos no SLO (≈ 15.000–18.000 cadastrados de CPU); ali o **escritor único do
  SQLite** (~37 escritas/s por 1.000 simultâneos) e o volume viram o limite antes da CPU.
- **10.000 simultâneos**: ~1.220 req/s, ~3,9 núcleos ocupados (≥ 6 processos no joelho), ~370 escritas/s — passo 4.

## O que o Worker mediu (staging, 21/10/2026)

Em 2 h de staging (92 requisições, 0 erros): CPU por requisição **p50 26 ms, p90 112 ms, p99 921 ms**; tempo total p50
154 ms, p90 365 ms, p99 1 046 ms. O boot frio custava 90–162 ms de CPU (scrypt); com `SECRET_KEY=hkdf:<64 hex>` isso
saiu do boot (`docs/deploy.md`). O k6 contra o staging (admissão de STT, upload de 100 MB) ainda está pendente.

## A escada

No Worker não há máquina para trocar: o Workers Paid escala os isolates sozinho. Os degraus são sobre o que pode
virar gargalo, em ordem de custo crescente.

| Passo                          | O quê                                                                                       | Custo/mês                           | Dispara quando (sustentado no pico)                                                                                                                       | Onde ver                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **0 — hoje**                   | Workers Paid + Hyperdrive + Supabase Pro                                                    | ver `LANCAMENTO.md` (Custo mensal)¹ | —                                                                                                                                                         | —                                                                                |
| **1 — CPU por requisição**     | cortar a rota cara (cache, índice, menos trabalho síncrono) antes de comprar qualquer coisa | zero                                | CPU p99 do Worker perto do limite de CPU por requisição do plano (conferir em developers.cloudflare.com/workers/platform/limits); ou rota única dominando | painel de Workers → Metrics (CPU time); Analytics Engine (`frasy_metricas`)      |
| **2 — conexões do banco**      | subir o limite de conexões de origem do Hyperdrive e/ou o compute do Supabase               | conforme o plano do Supabase        | erros de conexão/`too many connections`; p95 da consulta subindo com o tráfego; `/api/ready` oscilando                                                    | painel do Hyperdrive; Supabase → Reports → Database; log `db_*`                  |
| **3 — disco e custo do banco** | mais disco/compute do Supabase; arquivar o que for frio                                     | conforme o plano do Supabase        | banco perto do limite do disco do plano                                                                                                                   | Supabase → Settings → Compute and Disk                                           |
| **4 — self-host em Node**      | mais instâncias (`REPLICAS`) sobre o mesmo Postgres                                         | a VM do seu provedor                | CPU do Node > 60 % de 1 núcleo sustentada; RSS > 80 % do limite do container                                                                              | `process_cpu_seconds_total`, `process_resident_memory_bytes`, `BabelMemoriaAlta` |

¹ O custo do passo 0 tem UMA fonte: a tabela "Custo mensal" de [`docs/LANCAMENTO.md`](LANCAMENTO.md).

**IA não é CPU nem banco.** Os sinais de IA escalam o **provedor**, não a máquina. O rótulo `plano` das
métricas de admissão é a FAIXA de prioridade de `server/ai/admissao.ts` — `premium`, `gratis` (Grátis,
convidado e o teste de 14 dias) ou `alivio` —, não o nome do plano; até 29/09/2026 eram `pro`/`essencial`
(matriz v2, ADR 0011):

| Sinal                                                         | Ação                                                                                                  | Métrica / alerta                                                        |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 429 do provedor crescendo (> 5 em 10 min, recorrente no pico) | subir o tier do Groq (Developer) — pendência do dono no ADR 0008 — e os limites `IA_ADMISSAO_*` junto | `ia_provedor_limite_total`, `BabelProvedorIaLimitando`                  |
| Recusas de admissão `minuto`/`dia` na faixa **premium**       | idem: o balde é o limite da conta                                                                     | `ia_admissao_recusada_total{plano="premium"}`, `BabelAdmissaoRecusando` |
| Recusas só de `gratis`/`alivio`                               | nada: é a reserva de quem paga funcionando                                                            | idem                                                                    |
| Gasto diário perto do teto todo dia                           | rever preço/cota do plano antes de subir `AI_BUDGET_USD_DAY`                                          | `ia_gasto_usd`, `ia_custo_usd_total{plano}`                             |

## Como escalar gastando pouco

```bash
# Hyperdrive: conferir a configuração atual (limite de conexões de origem)
npx wrangler hyperdrive list
npx wrangler hyperdrive get <id-do-hyperdrive>

# Worker: o tráfego e a CPU por requisição
npx wrangler tail -c wrangler.jsonc          # ao vivo; o histórico está no painel de Workers
```

O compute do Supabase muda pelo painel (Settings → Compute and Disk) e reinicia o banco por alguns minutos: faça fora
do pico, com `CHECKOUT_ENABLED=0` se houver risco para pagamento em andamento.

Regras que economizam sem risco:

- **Barateie a rota cara antes de comprar capacidade** quando o sinal vier de uma rota só (item 6 da Fase 2:
  `vocab`, `profile`, `gastar`) — o painel "p95 por rota" (self-host) ou o Analytics Engine dizem qual.
- **Suba por sinal sustentado, não por pico isolado.**
- **Desça quando o sinal some por uma semana.**
- **O Worker não tem estado local.** Nada de cache em memória que precise ser único; o que precisa ser único mora no
  banco (admissão de IA, limitador, `travas`).
