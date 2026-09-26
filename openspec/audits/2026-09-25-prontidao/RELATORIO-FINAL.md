# Prontidão para produção — relatório final (25/09/2026)

Branch `auditoria/prontidao-producao` (worktree `audit-v4`), a partir de `cf56e10`. Nada foi enviado ao GitHub.
Cada fase tem relatório próprio nesta pasta (`fase1` … `fase8`), com evidência `arquivo:linha` e os comandos
que mediram cada número. Este documento é o índice e o resumo.

## 1. Situação

O app sai de "funciona para 1 usuário" para **aguentar ~1.000 cadastrados numa máquina** (medido), com custo
previsível e operação instrumentada. Os 7 P0 da Fase 1 e os 4 P0 medidos na Fase 2 foram corrigidos e cobertos
por teste. O que ainda impede abrir a venda é **externo ao código**: a camada grátis da Groq atende ~8
assinantes e a chave de reserva (OpenRouter) está expirada.

Gates no estado final: tsc 0, eslint 0, vitest completo verde, build, i18n, contrato da API, migrations
(expand/contract), orçamento do bundle e validação dos workflows.

## 2. Achados e correções

### P0 (quebrava ou vazava custo) — todos corrigidos
| Achado | Correção | Evidência |
|---|---|---|
| Cota de STT forjável pelo cabeçalho WAV | taxa derivada do áudio, PCM coerente, 415/413 antes da cota | fase2 §0, `7c601a6` |
| Cliente escolhia o modelo pago | `x-model` ignorado na chave do app | `7c601a6` |
| Deploy sem CI verde | portão de CI + staging→produção com rollback automático | fase6 |
| API sem 404 JSON e sem versão | 404 JSON, `x-babel-versao`, aviso "Atualizar" | `fe7baa4` |
| 4 uploads derrubavam a máquina (1.011 MB) | streaming + semáforo → **339 MB** | fase2 §7 |
| IP de escola bloqueado 15 min | limitador conta só 401 na saída → 0% de 429 | fase2 §7 |
| Backup travava o servidor 20–34 s | processo filho + gzip em stream → **7–28 ms** | fase2 §7 |
| IA: cada 429 virava 3 pedidos; 2–4 falantes | admissão por provedor, prioridade por plano, pausa no cliente | ADR 0007, fase2 §7 |

### P1 (degradava com escala) — corrigidos
Rotas caras 20–100× mais baratas nas leituras repetidas (ETag por versão, cache, leitura compacta, dedupe no
cliente) · sessões de 5.000 falas e Anki de 40.000 notas (teto de variáveis) · R2 fora não derruba o
`/api/ready` · trava contra `REPLICAS>1` com SQLite · índices quentes · STT com disjuntor · 5xx isolado não
desliga a nuvem de quem paga · MT devolve 429 em vez de 502 · migrations com portão expand/contract e snapshots
drizzle · métricas coletadas, alertas e painel como código · versão semver e contrato da API.

### Ficaram abertos (P1/P2, com dono)
| Item | Por quê | Onde está descrito |
|---|---|---|
| Fila durável da importação na nuvem | a parte ao vivo do ADR 0007 bastou para os P0 | ADR 0007 |
| `.apkg` do Anki ainda inteiro na memória | o leitor exige Buffer; o semáforo limita a 1 por usuário e 2 no total | fase2 §7 |
| Temporários `.parcial` de upload após queda do processo | sem limpeza no boot | fase2 §7 |
| `keepAliveTimeout` alinhado ao proxy do Fly; INP medido em campo; `index-*.js` com 45 KB não usados na `/` | recomendações da Fase 4 | fase4 §8 |
| Revisão FSRS e orçamento global não atômicos | desvio pequeno, documentado | fase1 §5 |

## 3. Capacidade (o que quebra primeiro)

Medido com a suíte da Fase 4 (bundle de produção, auth ligada), corrigido para o Fly `shared-cpu-1x` (6,25% de
um núcleo sustentado). Hipótese: 10% dos cadastrados simultâneos.

| Cadastrados | Antes das correções | Depois | O que quebra primeiro agora | Mudar antes |
|---|---|---|---|---|
| 10 | 3,6% de erro já com 10 VUs | 0 erro, p95 34 ms | **Groq grátis** (limites diários) | Groq Developer; chave OpenRouter |
| 100 | 45% de erro | 0 erro, p95 < 10 ms | Groq por minuto (~67 cadastrados) | idem |
| 1.000 | 52% de erro, 1,6 GB de RSS | 0 erro, p95 21 ms (local) | **CPU do `shared-cpu-1x`** (~94 simultâneos no SLO) | `performance-1x` antes de ~100 simultâneos (`docs/escala.md`) |
| 10.000 | — | extrapolado: ~1.220 req/s, 3,9 núcleos, ~370 escritas/s | escritor único do SQLite e 1 processo | Postgres + réplicas (ADR 0006) |

Ponto de quebra de um processo (máquina local): **2.000 VUs** (p95 de leitura 334 ms com 72% de CPU).

## 4. Custo (modelo em `scripts/custo/modelo.mjs`)

Margem por assinante antes do fixo: Essencial R$ 14,38 (típico) / R$ 9,70 (teto do plano); Pro R$ 31,93 / R$ 24,44.
Mix 70% free, 20% Essencial, 10% Pro. Com a amostragem do Langfuse já aplicada (`e12e044`):

| Cadastrados | 10 | 100 | 1.000 | 10.000 | Equilíbrio |
|---|---|---|---|---|---|
| Resultado mensal | −R$ 136 | R$ 396 | R$ 5.499 | R$ 53.375 | **33 cadastrados** |

Pior caso combinado (câmbio +20%, uso 2×, Anexo V): equilíbrio em 289 e positivo a partir de 1.000. Free e
convidado não custam IA com a nuvem desligada; a cota proposta para eles (10/30 min, pool diário) está na
Fase 3/7. **O custo fixo real no Fly de São Paulo é ~R$ 199/mês**, não os US$ 31–34 do `docs/LANCAMENTO.md`.

## 5. Entregáveis

| Pedido | Onde |
|---|---|
| Relatório consolidado | este arquivo + `fase1` … `fase8` |
| Tabela de capacidade | §3; `fase2-escala.md` §3; `fase4-carga.md` |
| Modelo de custo | `scripts/custo/modelo.mjs`, `fase3-custo.md`, `.csv`, `-tabelas.md` |
| Suíte de carga e resultados | `scripts/perf/suite/`, `scripts/perf/escala/`, `docs/slo.md`, `fase4-carga.md` |
| ADRs | `docs/adr/0006` (banco), `0007` (fila/admissão de IA), `0008` (provedor), `0009` (armazenamento) |
| CI/CD e runbooks | `.github/workflows/{ci,deploy,implantar-ambiente,restauracao-drill,lighthouse}.yml`, `docs/deploy-checklist.md`, `docs/runbook.md` (§0.2, §0.3, §13), `docs/versionamento.md`, `docs/escala.md` |
| Observabilidade | `ops/alertas/regras.yml` (18 regras), `ops/dashboards/babel-play.json`, `fase5-observabilidade.md` |
| Modo convidado | `server/lib/convidado.ts`, `src/lib/convidado.ts`, `fase7-convidado.md` |
| Ofertas de planos | `src/lib/ofertas/`, `src/components/ofertas/`, `docs/ofertas.md`, `fase8-ofertas.md` |
| Flags remotas | `docs/flags.md`, `src/core/flags.ts`, `server/lib/flags.ts`, CLI `operacao flags` |

## 6. O que depende do dono (em ordem)

1. **Groq Developer** e **chave nova da OpenRouter** — sem isso a IA atende ~8 assinantes. Trocar as chaves que
   foram coladas no chat.
2. **Fly:** app `babel-play-staging` com volume; decidir `performance-1x` antes de ~100 simultâneos.
3. **GitHub:** Environments `staging`, `production` (Required reviewers) e `restauracao` com os secrets de
   `fase6-distribuicao.md`; `HEALTH_URL`; branch protection exigindo `verify`, `migracoes`, `carga`, `imagem`.
4. **Primeiro exercício de restauração em produção** (runbook §0.2) e decidir se o exercício pelo Actions é
   aceitável pela LGPD (o banco tem dados de menores).
5. **Grafana Cloud** com fonte do Prometheus do Fly, importar painel e regras, e para onde vão os alertas.
   Definir `AI_BUDGET_USD_DAY` e incluir os eventos novos na regra do Sentry.
6. **Supabase:** Anonymous sign-ins, Manual linking, template de "Change email", `SUPABASE_SERVICE_ROLE_KEY`.
   **Cloudflare Turnstile** e `VITE_TURNSTILE_SITE_KEY`.
7. **Flags** (todas desligadas): `modo_convidado` primeiro; `oferta_planos` quando quiser vender;
   `nuvem_convidado` só depois do upgrade da Groq e da decisão sobre menores.
8. **Langfuse** (projeto `babel-play`), contador, advogado e as contas de `docs/LANCAMENTO.md` — pendências
   anteriores que continuam valendo. Corrigir o custo fixo no `LANCAMENTO.md`.
9. Revisar e fazer push da branch; primeira release com `npm run release`.
