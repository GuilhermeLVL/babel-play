# Fase 5 — verificação, aposentadoria do Fly e portão G1 (21/10/2026)

Status: concluído · Autor: Guilherme (com o assistente) · Branch `cloudflare/migracao` → `main`

A Fase 5 fecha a migração do Frasy para a Cloudflare (spec `docs/specs/2026-10-19-migracao-cloudflare.md`, opção C:
Workers + Hyperdrive + Postgres do Supabase em São Paulo). Plano: `docs/superpowers/plans/2026-10-21-fase5-portao-g1.md`
(9 tarefas, implementador + revisor por tarefa, ledger SDD). As fases anteriores estão em
`2026-10-19-spikes-cloudflare.md` e o staging em `2026-10-20-fase4-staging.md`.

## Três fatos que mudaram o desenho da fase (R15–R17)

- **O Fly nunca foi implantado.** `https://babel-play.fly.dev/api/health` não responde e `docs/ESTADO-DO-LANCAMENTO.md`
  registrava "o deploy no Fly (nunca feito)". Logo não há baseline vivo para "k6 Fly × Cloudflare", não há SQLite de
  produção para migrar e "Fly 14 dias como retorno" não se aplica: o corte é o **primeiro deploy de produção**, que
  depende do dono (Workers Paid, zona, Environment `production`).
- **PITR é add-on pago do Supabase.** O drill que está nas nossas mãos é `pg_dump` → R2 → `pg_restore` com contagens
  iguais; o PITR fica em "Depende do dono".
- **Docker fica para o self-host**, sem Litestream (ADR 0015).

## O que entrou

| Tarefa                  | Entrega                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. KDF rápido           | `SECRET_KEY=hkdf:<64 hex>` deriva por HKDF-SHA256 (0,1 ms); qualquer outro valor segue no scrypt, byte a byte (self-host intacto); `hkdf:` malformado derruba o boot. `tests/crypto-kdf.test.ts`. Staging já usa o formato.                                                                                                                                                                                                                                                         |
| 2. CI verde             | `tsconfig.estrito.json` sem `scripts/spikes` (767 erros → 4, corrigidos de verdade), `.madgerc` ignorando `import type` (4 ciclos só de tipo), `libsql` fora, `vite` 6.4.5 (HIGH do `audit:gate`), 2 chaves órfãs de i18n, fallback de locale sem `'pt'` cravado, e2e público declara a idade (`PUT /api/me/idade`). Primeira execução **inteiramente verde** do ramo: run 39603153892.                                                                                             |
| 3–5. Fly fora           | `fly.toml`, `fly.staging.toml`, `litestream.yml`, `iniciar-container.sh`, `deploy.yml`, `implantar-ambiente.yml`, drill SQLite e job `restauracao-litestream` apagados; `Dockerfile` do self-host sem Litestream (job `imagem` prova contra `postgres:17`); `server/operacao/snapshot.ts`, `BACKUP_*`, 3 métricas e a regra de alerta do snapshot removidos; `@libsql/client` só em dev; ADR 0015; docs/READMEs sem Fly (`tests/docs-sem-fly.test.ts`, `tests/ci-sem-fly.test.ts`). |
| 6. Drill de restauração | `scripts/backup/drill-restauracao.mjs` (pg*dump → banco vazio → pg_restore → contagens por tabela; recusa destino não vazio; credenciais só por `PG*`/`DRILL\*\*`) + `restauracao-drill.yml`mensal contra o R2 (Environment`restauracao`, só leitura, sem artefato).                                                                                                                                                                                                                |
| 7. Ensaio da migração   | `scripts/migracao/sqlite-para-postgres.ts` sobre cópia do SQLite de dev.                                                                                                                                                                                                                                                                                                                                                                                                            |
| 8. Carga                | `scripts/perf/carga.k6.js` contra o staging (token por VU, `erros_429`), `scripts/perf/staging-usuarios.mjs` (usuários descartáveis, token em arquivo 600, nunca no stdout).                                                                                                                                                                                                                                                                                                        |

## Portão G1: critérios de aceite da spec

| Critério da spec                                                                    | Resultado                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| S6: latência do banco do Worker no Brasil                                           | **ok** (Fase 0b/S7: Hyperdrive → Supabase SP, 15–21 ms por ida; `2026-10-19-spikes-cloudflare.md`)                                                                                                                                                                                                                                   |
| `/api/me`, registrar resultado, vocabulário: p50 ≤ 130 ms e p95 ≤ 250 ms do Brasil  | **não provado até o Paid** (os números abaixo são evidência; a carga reprovou por CPU no Free): k6 (20 VUs, 10 usuários, rede de casa) `me` p50 85/p95 121 ms, `para-jogo` 87/128, `rodada` 121/194, `perfil` 145/224 (p50 acima), só sucessos p50 108/p95 202 ms. Ver "Carga" abaixo: 16 % de 503 pelo teto de CPU do Workers Free. |
| `typecheck`, `lint`, `npm test` passam; testes de WAL/snapshot/réplica substituídos | **ok**: CI do ramo verde (runs 39603153892, 39605128284, 39607849650); 12 199 testes; os de snapshot/Litestream saíram com o código, `tests/seguranca/*` intactos                                                                                                                                                                    |
| AAL2: `/API/me` continua 404 no Worker                                              | **ok** (`tests/worker/roteamento-da-api.test.ts`: `/API/me` dá 404 JSON no `fetch` do Worker, sem Express e sem SPA; `/api/me` segue para o app; conferido na revisão final)                                                                                                                                                         |
| Webhook do Asaas idempotente e checkout sandbox no E2E                              | **ok** (suíte `e2e` e `e2e-publico` verdes no CI; `billingEventsRepo.marcarSeNovo` coberto em integração)                                                                                                                                                                                                                            |
| `.apkg` de 200 MB ≤ 60 s no navegador                                               | **ok** (Fase 3: 0,46 s em Node, 4,4 s no navegador)                                                                                                                                                                                                                                                                                  |
| Paridade de dados SQLite → Postgres (contagem + checksum por tabela)                | **ok**: ensaio sobre cópia de `data/babel.db`: 38 tabelas, 4 197 linhas, contagem e sha256 iguais em todas; `--continuar` idempotente; ~0,9 s; 174 colunas INTEGER sem fração                                                                                                                                                        |
| Restauração: PITR 1 h atrás e export para o R2 testados e documentados              | **parcial**: drill `pg_dump` → `pg_restore` provado contra o `frasy_staging` (40 tabelas + `__drizzle_migrations`, 41 linhas iguais); export semanal ao R2 (`backup-pg-dump.yml`) e o drill mensal contra o R2 **dependem das chaves S3 do dono**; PITR é add-on do Supabase (dono)                                                  |
| Custo da primeira fatura ≤ US$ 36                                                   | **não medido** (sem produção; estimativa em `docs/LANCAMENTO.md`: Workers Paid US$ 5 + Supabase + domínio ≈ R$ 165/mês)                                                                                                                                                                                                              |
| Fly 14 dias como retorno; DNS volta em ≤ 5 min                                      | **não se aplica** (R15): não há Fly no ar; o retorno antes do corte é não cortar                                                                                                                                                                                                                                                     |

## scrypt frio: resolvido no KDF, boot ainda acima de 50 ms

Com a chave `hkdf:` publicada no staging (run 39600324492), os minutos com boot de isolate novo custaram **48, 63,
69, 77 e 89 ms de CPU** (p50 69) contra **90–162 ms** na Fase 4; minutos quentes, 10–22 ms. O KDF saiu do custo
(0,1 ms); o que sobra no boot é validação de configuração, leitura do journal de migrations e JIT. O critério de
50 ms vale para o KDF; o boot inteiro fica acima e é **aceito** (um isolate novo por colo e por deploy; no plano
Paid o teto é 30 s).

## Carga contra o staging (k6, 20 VUs, 10 usuários, 13:30–13:33 UTC)

| rota       | p50 | p90 | p95 |   max |
| ---------- | --: | --: | --: | ----: |
| health     |  64 |  82 | 103 |   904 |
| me         |  85 | 105 | 121 | 1 110 |
| para-jogo  |  87 | 108 | 128 | 1 251 |
| perfil     | 145 | 185 | 224 | 2 373 |
| rodada     | 121 | 168 | 194 | 1 198 |
| xp         | 102 | 130 | 143 |   894 |
| resultados |  82 |  99 | 108 | 1 002 |

Vistos de casa (TLS ≈ 130 ms), todas as respostas. Só sucessos: p50 108 / p95 202 ms. Baseline do Node
(`docs/slo.md`, set/2026): classe leitura p95 300 ms, gravação p95 800 ms — o Worker fica abaixo nas duas.

**Disponibilidade reprovada, e a causa é o plano.** 16 % das requisições (1 416 de 8 866) voltaram 503 com corpo
vazio e 14 % voltaram 429. Do lado do servidor (analytics da Cloudflare por minuto e status): 7 461 invocações
`success` (CPU p50 11–18 ms, wall p50 47–99 ms) e **1 680 `exceededResources`** (CPU p50 10 / p99 14 ms): é o
**teto de 10 ms de CPU por requisição do Workers Free**, que mata a invocação e devolve 503 sem corpo. Não é
defeito do app; o plano Paid (30 s de CPU) já é pré-requisito da produção. Teste de carga só faz sentido depois
dele. Os 429 vêm do limitador de escrita por usuário (2 VUs por usuário, 5 rodadas por iteração): calibração a
conferir com uso humano (dívida). A rota `review` ficou sem medição (precisa de um cartão por usuário).

## Dívidas registradas (para a Fase 6 / lançamento)

- Carga de verdade (k6 de uma rede boa, 50 VUs, upload de 100 MB, `review`) depois do Workers Paid; conferir o
  limitador de escrita por usuário.
- `scripts/custo/modelo.mjs` ainda modela o Fly; `public/privacidade.html` ainda nomeia o Fly.io como operador
  (registrado em `docs/lgpd/operadores.md`); painel Grafana com "Tamanho do banco (SQLite + WAL)".
- `Cross-Origin-Resource-Policy` nos estáticos (ZAP 90004, Fase 4).
- `node:22-slim` do self-host não traz `pg_dump`/`pg_restore` (o `scripts/backup.mjs` não roda dentro da imagem).
- Minors deferidos no ledger: teste de tempo do HKDF frágil; linha "Estado" duplicada no ADR 0006;
  `erros_429` sem sub-métrica por rota; `--apagar` do script de usuários só olha a 1ª página; `drill-restauracao`
  com `--dbname=undefined` se a URL não tiver banco.
- O staging divide o Supabase Auth com a produção (R11): projeto separado antes do lançamento.

## Depende do dono (o corte)

1. Workers Paid (7 crons; teto de CPU) e a zona `frasy.com.br` na Cloudflare; domínio no Worker.
2. GitHub Environment `production` (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `DATABASE_URL_MIGRACAO`,
   `SUPABASE_CA_PEM`, vars `VITE_*`) e `.secrets.production.json` pelo script; dois runs do `deploy-worker.yml`.
3. Chaves S3 do R2: escrita para `backup-pg-dump.yml` (`frasy-backups`), leitura para o Environment
   `restauracao` do drill mensal.
4. Supabase: Site URL/Redirects, PITR (add-on), projeto separado para o staging; Asaas (webhook), Resend, Turnstile.
5. Passeio manual no staging com o console aberto (captura, jogos, importação de `.apkg`) para violação de CSP.
6. Apagar o Worker antigo `babel-play`.
