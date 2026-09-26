# Critérios de escala — quando e como crescer (Fase 5 de prontidão, 25/09/2026)

Este documento responde **"a métrica X disparou; qual é o próximo passo, quanto custa e qual o comando?"**.
Os limiares vêm das medições da Fase 2 (`openspec/audits/2026-09-25-prontidao/fase2-escala.md`) e do
ADR 0006 (`docs/adr/0006-sqlite-numa-maquina-ate-o-gatilho-de-postgres.md`). As métricas estão em
`server/http/metricas.ts`, as do Fly em [fly.io/docs/monitoring/metrics](https://fly.io/docs/monitoring/metrics/),
e os alertas de planejamento (`BabelEscala*`, a 70 % de cada gatilho) em `ops/alertas/regras.yml`.

## O que a Fase 2 mediu (e decide a ordem)

- `shared-cpu-1x` sustenta **6,25 % de um núcleo**; acima disso gasta um saldo de rajada (até ~500 s) e
  depois é **estrangulado** pelo Fly (métrica `fly_instance_cpu_throttle`).
- Demanda estimada no pico: **0,000274 × cadastrados núcleos** (100 → 44 % da base; 1.000 → 4,4× a base) e
  **~0,076 × cadastrados escritas/s**.
- **Até ~1.000 cadastrados a CPU quebra antes do banco.** O SQLite de escritor único deixa de bastar entre
  1.000 e 2.000 cadastrados (teto ~80–160 escritas/s sustentadas no Fly).
- RSS: 290–300 MB em repouso, 470–590 MB sob carga; 2 uploads grandes simultâneos ≈ +340 MB.
- Banco: ~3,9 MB por usuário pesado; o volume está limitado a 10 GB (`fly.toml`).

## O que a Fase 4 mediu depois das correções (suíte de carga, `openspec/audits/2026-09-25-prontidao/fase4-carga.md`)

Usuários virtuais com ritmo de gente e a mistura realista (`scripts/perf/suite/rodar.mjs`; SLOs em `docs/slo.md`):

- **0,038 % de um núcleo por usuário simultâneo** (+ 0,8 % de repouso); **0,122 req/s** e **0,037 escritas/s** por
  usuário simultâneo; RSS 316 MB com 100, 426 MB com 1.000, 669 MB com 2.000.
- Numa máquina local, dentro do SLO até **1.000 simultâneos** (p95 21 ms, 0 erro, CPU 39 %); **quebra com 2.000**
  (p95 334 ms, CPU 72 %: o joelho de um event loop).
- **No `shared-cpu-1x`: ~94 simultâneos dentro do SLO, ~143 no limite da cota** (≈ 1.000 cadastrados com 10 %
  simultâneos) — a demanda estimada da Fase 2 (0,000274 × cadastrados) caiu para \*\*~0,000038 núcleo × cadastrados
  - repouso\*\*, ~7× menos, depois das rotas caras e da admissão de IA.
- Num `performance-1x`: ~1.800 simultâneos no SLO (≈ 15.000–18.000 cadastrados de CPU); ali o **escritor único do
  SQLite** (~37 escritas/s por 1.000 simultâneos) e o volume viram o limite antes da CPU.
- **10.000 simultâneos**: ~1.220 req/s, ~3,9 núcleos ocupados (≥ 6 processos no joelho), ~370 escritas/s — passo 4.

Por isso a ordem é **vertical primeiro** (CPU dedicada, depois memória) e só então **horizontal com
Postgres** — escalar horizontalmente com SQLite não é um passo, é um defeito.

## A escada

| Passo                                  | Máquina                                                                | Custo/mês (tabela do Fly, set/2026)¹ | Dispara quando (qualquer um, sustentado no pico)                                                                                                                                                                       | Métrica / alerta                                                                                                     |
| -------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **0 — hoje**                           | `shared-cpu-1x`, 1 GB, 1 máquina, SQLite no volume                     | ~US$ 5,91 + volume (US$ 0,15/GB)     | —                                                                                                                                                                                                                      | —                                                                                                                    |
| **1 — CPU dedicada**                   | `performance-1x`, 2 GB                                                 | ~US$ 32,19                           | CPU estrangulada > 0 por **30 min** no pico; **ou** CPU do Node > **70 % da base** (0,044 núcleo) por 1 h; **ou** p95 fora da IA > 1 s com a CPU estrangulada; **ou** ~150 cadastrados ativos                          | `fly_instance_cpu_throttle`, `rate(process_cpu_seconds_total)`, `BabelEscalaCpuEstrangulada`, `BabelLatenciaP95Alta` |
| **2 — mais memória**                   | `performance-1x`, 4 GB (ou `shared-cpu-1x` 2 GB se a CPU ainda couber) | +~US$ 5 por GB                       | RSS > **80 %** da VM por 10 min; **ou** `uploads_grandes_em_voo` no teto com recusas `processo` diárias (aí subir memória **e depois** `UPLOADS_GRANDES_POR_PROCESSO`); **ou** OOM (`fly_instance_exit_oom = 1`)       | `process_resident_memory_bytes`, `BabelMemoriaAlta`, `BabelUploadsNoTeto`                                            |
| **3 — mais CPU numa máquina**          | `performance-2x`, 4 GB (+ `CLUSTER_WORKERS=2`)                         | ~US$ 64,39                           | CPU do Node > **60 %** de 1 núcleo sustentada já no `performance-1x` (o gatilho de CPU do ADR 0006) **e** escritas ainda abaixo de 35/s                                                                                | `rate(process_cpu_seconds_total) > 0.6`                                                                              |
| **4 — Postgres + réplicas** (ADR 0006) | Postgres do Supabase Pro + 2 máquinas                                  | Supabase Pro já no plano + 2× a VM   | **o primeiro** de: escritas > **50/s** no pico (alerta a 35/s); banco > **5 GB** (alerta a 3,5 GB); necessidade de 2ª máquina (alta disponibilidade, ou CPU > 60 % já no passo 3); **1.000 cadastrados ativos no mês** | `rate(db_escritas_total)`, `db_tamanho_bytes`, `BabelEscalaEscritasSQLite`, `BabelEscalaBancoGrande`                 |

¹ Preços-base da [tabela do Fly](https://fly.io/docs/about/pricing/) consultada em 25/09/2026; a região `gru`
pode custar mais — confira em `fly platform vm-sizes` e no painel de faturamento antes de subir.

**IA não é CPU nem banco.** Os sinais de IA escalam o **provedor**, não a máquina:

| Sinal                                                         | Ação                                                                                                  | Métrica / alerta                                                    |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 429 do provedor crescendo (> 5 em 10 min, recorrente no pico) | subir o tier do Groq (Developer) — pendência do dono no ADR 0008 — e os limites `IA_ADMISSAO_*` junto | `ia_provedor_limite_total`, `BabelProvedorIaLimitando`              |
| Recusas de admissão `minuto`/`dia` para o plano **pro**       | idem: o balde é o limite da conta                                                                     | `ia_admissao_recusada_total{plano="pro"}`, `BabelAdmissaoRecusando` |
| Recusas só de `essencial`/`convidado`                         | nada: é a reserva do Pro funcionando                                                                  | idem                                                                |
| Gasto diário perto do teto todo dia                           | rever preço/cota do plano antes de subir `AI_BUDGET_USD_DAY`                                          | `ia_gasto_usd`, `ia_custo_usd_total{plano}`                         |

## Como escalar gastando pouco

```bash
# Passo 1 — CPU dedicada (a máquina reinicia: ~20 s fora, igual a um deploy)
fly scale vm performance-1x --app babel-play          # performance-1x já vem com 2 GB

# Passo 2 — memória, sem trocar a CPU
fly scale memory 4096 --app babel-play

# Voltar (fora do pico, se o sinal sumiu por uma semana)
fly scale vm shared-cpu-1x --memory 1024 --app babel-play
```

Depois de qualquer `fly scale vm`/`memory`, **atualize o `[[vm]]` do `fly.toml`** no mesmo dia — senão o
próximo `fly deploy` volta ao tamanho antigo — e ajuste o limiar do `BabelMemoriaAlta` (ele assume 1 GB).

Regras que economizam sem risco:

- **Vertical antes de horizontal.** Um `performance-1x` (~US$ 32) aguenta ~16× a CPU sustentada do
  `shared-cpu-1x`; duas máquinas com SQLite não aguentam nada (dois bancos divergentes).
- **Suba por sinal sustentado, não por pico isolado.** Os alertas de planejamento pedem 30 min–1 h de
  sinal; um pico de 5 min é o que o saldo de rajada do `shared-cpu` existe para absorver.
- **Desça quando o sinal some por uma semana.** Escala vertical no Fly é um reinício, não uma migração.
- **Barateie as rotas caras antes de comprar CPU** quando o sinal vier de uma rota só (item 6 da Fase 2:
  `vocab` 133 ms, `profile` 77 ms, `gastar` 154 ms de CPU) — o painel "p95 por rota" diz qual.

## O que NÃO fazer com SQLite numa máquina

- **`fly scale count 2`** — cria um segundo volume e um segundo banco; as escritas se dividem e nunca se
  juntam. O boot recusa `REPLICAS>1` com banco local, mas o `fly scale count` não passa por essa trava.
- **Auto-stop** (`auto_stop_machines = "stop"`/`"suspend"`) — com uma máquina só, parar é ficar fora do ar:
  a primeira requisição espera o boot (migrações + checagem do Litestream), o webhook do Asaas tem timeout
  curto e o snapshot diário/retenção só rodam com o processo vivo. O `fly.toml` mantém `"off"` e
  `min_machines_running = 1` de propósito.
- **Autoscaling por concorrência** (`soft_limit` subindo máquinas) — só depois do passo 4; até lá o
  `hard_limit = 250` é a proteção, e 429/fila é melhor que um segundo banco.

## Passo 4, resumido (ADR 0006)

1. Migrar o schema drizzle para o Postgres do Supabase (as 30 migrações); dados por export/import com a
   máquina em `CHECKOUT_ENABLED=0 SIGNUP_ENABLED=0`.
2. Mover para o banco o que ainda é estado do processo e precisa ser único (admissão de IA, cache de
   tradução se quiser compartilhar, limitador) — lista em `fase1-mapeamento.md` §4.
3. Tirar o Litestream (o backup passa a ser o do Supabase) e só então `fly scale count 2`, com
   `auto_stop_machines = "off"` e o `/api/ready` como checagem de cada máquina.
4. Com N máquinas, as métricas passam a vir de N processos (label `instance` do Fly): os painéis já somam
   por `sum(...)`/`max(...)`; o `processo_info` diz quem é quem.
