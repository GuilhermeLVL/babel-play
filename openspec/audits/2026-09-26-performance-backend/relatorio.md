# Auditoria de performance do backend — chamadas e consultas lentas (26/09/2026)

Branch `perf/backend-2026-09` (a partir de `main` em `050a16f`), worktree `.claude/worktrees/fx-backend`.
Método: `docs/pesquisa/2026-09-auditoria-seguranca-performance-dispositivos.md` §2 (EXPLAIN QUERY PLAN,
perfil de CPU, contagem de consultas por requisição para N+1). Tudo abaixo foi medido com os scripts
versionados em `scripts/perf/consultas/`; os JSON brutos ficaram no scratchpad da sessão e são
reproduzíveis com os comandos da §7.

## 0. Resumo

| # | Achado | Antes | Depois | Commit |
|---|---|---:|---:|---|
| P0 | **FK sem índice no lado filho**: todo DELETE físico no pai varria a tabela filha inteira por linha apagada, com o event loop preso (driver síncrono) | apagar as 100 falas de uma sessão (`PUT /api/sessions/:id/utterances`): **15.467–17.019 ms** | **0,9 ms** | `7204018` |
| P0 | idem, exclusão de conta (`DELETE /api/me`, LGPD) | conta pesada (3.000 cartões, 20 sessões): **530.915 ms (8,8 min)**; conta média: 19.466 ms | **171 ms**; 8,8 ms | `7204018` |
| P1 | **Boot**: a migração Leitner→FSRS varria `vocab_cards` inteira a cada boot, e com legado fazia 5.000 UPDATEs aguardados um a um | banco no boot (estado normal): 230–559 ms; com 5.000 legados: 1.993 ms | 4,9 ms; 827 ms | `218df40` |
| P2 | **N+1 do plano**: `subscriptions` lida 3× em cada `POST /api/ai/stt` e `/mt` | 7,86 e 8,51 instruções/req | 6,23 e 6,42 | `c1bb464` |

- **O que a suíte de carga NÃO mostra**: a mistura realista não apaga nada e não reinicia o servidor, então os
  três achados acima quase não aparecem nela. As rodadas A/B (§2.2) ficaram dentro do ruído da máquina — outros
  agentes ocupavam de 5 a 11,7 núcleos durante as medições — e **não sustentam** nenhuma afirmação de ganho ou
  perda de latência na suíte. O que sustenta os números da tabela são medições isoladas, com o mesmo banco,
  antes e depois (§3).
- **Custo das correções na escrita** (índices novos): +7 % no p50 de inserir 20 ocorrências (0,726 → 0,779 ms),
  +11 % em 10 resultados de exercício (0,511 → 0,569 ms), nada mensurável em revisão e falas (§3.1). A migração
  0034 custa **2,0 s uma vez** no banco de 621 MB (0034 + 0035 no boot seguinte ao deploy).
- **Hotspot do servidor sob carga**: o SQLite executando (`libsql_js::statement::Rows::js_next`) é **50,5 % da CPU
  ocupada** com 1.000 VUs; o Drizzle montando consultas e mapeando linhas, **12,4 %**. A rota mais cara por chamada
  continua sendo `GET /api/vocab` sem cache (~90–103 ms de CPU com 3.000 cartões) — não corrigida aqui (§5).
- Gates: tsc 0 · eslint 0 · vitest 494 arquivos / 5.079 testes (3 arquivos com timeout sob a máquina carregada,
  verdes ao rodar de novo) · build ok · contrato da API ok (99 rotas) · migrations ok (36, 0 erros).

## 1. Ambiente e método

| Item | Valor |
|---|---|
| Máquina | AMD Ryzen 5 5600 (6 núcleos / 12 threads), 16 GB, Windows 11, Node 24.18.0 |
| Carga concorrente | **outros agentes rodando em paralelo** (segurança, frontend, dispositivos). A coluna "outros núcleos" das tabelas é o que não era nem o servidor nem o gerador: 5,0–11,7 núcleos. Duas vezes a máquina ficou sem memória (processos `fork` falhando); uma rodada instrumentada de 1.000 VUs morreu no meio e foi refeita |
| Banco da suíte | `scripts/perf/suite/preparar.mjs` (migrations reais + `semear.mjs`): 2.051 usuários, 453.000 cartões, 453.000 ocorrências, 260.500 falas, 255.000 revisões, 255.000 exercícios, 621 MB |
| Banco por rota | `preparar` com 200 pesados + 2.000 leves (o de `escala/carga-servidor.mjs`): 2.201 usuários, 643.000 cartões, 440.500 falas, 878 MB |
| Servidor | `dist-server/server.cjs` (o `npm run build`), `NODE_ENV=production`, `AUTH_REQUIRED=1`, JWKS ES256 local, provedor de IA falso |
| "Antes" | o bundle de `main` (`050a16f`) com as migrations de `main` (`MIGRATIONS_DIR` apontando para um `git archive` delas — sem isso o bundle antigo aplicaria 0034/0035 na cópia e mediria o "depois") |

**Instrumentação nova** (`scripts/perf/consultas/`, nada disso entra no bundle):

- `coletor.cjs` — pré-carregado com `-r`. Embrulha o driver síncrono `libsql` (`Database#prepare`, `Statement#all/run/get`,
  `Database#exec`) e mede cada instrução no ponto em que ela prende o event loop; normaliza o SQL (listas `in (?…)` e
  `values (…)` viram uma forma só); abre um `AsyncLocalStorage` por requisição (`http.Server#emit('request')`) e
  registra, por rota, instruções por requisição, ms de banco e as instruções repetidas na mesma requisição (N+1).
- `analisar.mjs` — agrega, roda `EXPLAIN QUERY PLAN` de cada consulta no banco semeado (somente leitura, parâmetros
  ligados a NULL) e marca `SCAN` de tabela com mais de 10.000 linhas, `USE TEMP B-TREE`, SELECT sem LIMIT que
  devolveu mais de 100 linhas, e consultas repetidas 3+ vezes numa requisição.
- `perfil-cpu.cjs` + `resumir-perfil.mjs` — o `.cpuprofile` do `--cpu-prof`, mas recortado na janela medida
  (`inspector` + `Profiler`, disparado por arquivo-sinal). `--cpu-prof` puro não serve aqui: só grava quando o
  processo sai normalmente, e os scripts de carga encerram o servidor com `kill()` (TerminateProcess no Windows).
- `fks-sem-indice.mjs` — lista cada FK e o índice que serve a busca do lado filho.
- `medir-exclusoes.mjs` — mede os DELETEs físicos (falas de uma sessão; a exclusão de conta na ordem de
  `TABELAS_DO_TITULAR`) numa CÓPIA do banco, com os PRAGMAs de `server/db/db.ts`.
- `suite/rodar.mjs` e `escala/carga-servidor.mjs` ganharam `--coletor-dir` (e o primeiro, `--cpu-prof-dir`) e passam
  `MIGRATIONS_DIR` adiante.

## 2. Inventário de consultas e rotas lentas

### 2.1 Inventário

| Fonte | Execuções | Consultas distintas |
|---|---:|---:|
| `tests/caracterizacao` + `tests/integration` (vitest, coletor em cada fork) | 98.478 | 944 |
| suíte de carga, 100 VUs, bundle antes | 12.570 | 74 |
| suíte de carga, 1.000 VUs, bundle depois | 59.221 | 84 |
| `carga-servidor.mjs` por rota (7 rotas × 2 níveis), bundle depois | 283.502 | 53 |

**Chaves estrangeiras** (`fks-sem-indice.mjs`, banco da suíte, antes da 0034):

| tabela filha | linhas | coluna | referencia | índice antes | depois (0034) |
|---|---:|---|---|---|---|
| vocab_occurrences | 453.000 | utterance_id | utterances.id | **nenhum** | `idx_occ_utterance` (parcial) |
| vocab_occurrences | 453.000 | card_id | vocab_cards.id | só skip-scan (`idx_occ_user_card`, `idx_occ_probe`) | `idx_occ_card` |
| exercise_results | 255.000 | card_id | vocab_cards.id | só skip-scan (`idx_exercise_results_card`) | `idx_exercise_results_card_id` (parcial) |
| exercise_results | 255.000 | session_id | sessions.id | **nenhum** | `idx_exercise_results_session` (parcial) |
| vocab_cards | 453.000 | session_id | sessions.id | só skip-scan (`idx_vocab_session`) | `idx_vocab_session_id` (parcial) |
| anki_notes | — | projected_card_id | vocab_cards.id | **nenhum** | `idx_anki_notes_projected_card` (parcial) |
| anki_imports | — | deck_id | anki_decks.id | só skip-scan (`idx_anki_imports_user_deck`) | `idx_anki_imports_deck` |
| provider_credentials | — | secret_ref | secrets.ref | **nenhum** | `idx_provider_credentials_secret` (parcial) |
| review_logs, utterances, anki_notes.deck_id | | | | ok | — |

**Consultas com sinal, em rotas** (fora as do boot/migrations; EXPLAIN no banco semeado):

| Consulta (rota) | Sinal | Medido | Destino |
|---|---|---|---|
| `DELETE FROM utterances WHERE session_id=? AND user_id=?` (`PUT /api/sessions/:id/utterances`, `server/db/repositories/utterances.ts:68`) | `SCAN vocab_occurrences` (verificação da FK por linha apagada) | 15.467–17.019 ms / 100 falas | **corrigido** (0034) |
| `INSERT INTO utterances …` e `INSERT INTO sessions …` (`POST /api/sessions`) | `SCAN vocab_occurrences` / `SCAN exercise_results` no plano | 2,0 ms e 0,48 ms médios sob carga | o ramo da FK no INSERT do pai só roda com violação adiada pendente; some do plano com a 0034 |
| `select … from vocab_cards where deleted_at is null and stability is null and box > ?` (boot, `server/db/manutencao.ts:135`) | `SCAN vocab_cards` (453.000) | 227 ms quente, 504 ms frio | **corrigido** (0035) |
| `select difficulty_score from vocab_cards where user_id=? …` (`GET /api/vocab/para-jogo`, `cortesDeFaixa`, `server/db/repositories/vocab.ts:752`) | SEM LIMIT (3.000 linhas) | 8,6 ms isolado | medido, não corrigido (§5) |
| leitura das notas do baralho no import Anki (`POST /api/import/anki`) | SEM LIMIT (até 40.000 linhas) | p95 214–236 ms nos testes | rota cara já com `expensiveLimiter`; §5 |
| falas da sessão (`GET /api/sessions/:id`, `listBySession`) | SEM LIMIT (até 5.000) | p95 102 ms nos testes | teto do schema (5.000 falas); aceito |
| `SELECT DISTINCT card_id, origin_ref FROM vocab_occurrences …` (`GET /api/vocab`, `vocab.ts:286`) | `TEMP B-TREE FOR DISTINCT` | 7,4 ms médio / p95 7,25–33,9 ms | parte do caminho frio do baralho (§5) |
| `select … from sessions where user_id=? and deleted_at is null order by …` (`GET /api/sessions`) | `TEMP B-TREE FOR ORDER BY` | 0,27 ms médio, p95 0,37 ms (11.698 execuções) | barato; aceito |
| `select distinct origin_kind, origin_ref … card_id=?` (`POST /api/vocab/:id/review`, `procedenciaDe`) | `TEMP B-TREE FOR DISTINCT` | 2,4 ms sob carga (1 linha) | aceito |
| ranking, recordes, convidados, subscriptions por plano | `TEMP B-TREE` | < 1 ms | aceito |

**Repetidas na mesma requisição (N+1)**:

| Rota | Repetição | Destino |
|---|---|---|
| `POST /api/ai/stt`, `POST /api/ai/mt`, `POST /api/tutor/chat` | `select … from subscriptions` ×3 (plano perguntado pela porta, pelas cotas e pela telemetria) | **corrigido** (`memoDoRequest`) |
| `POST /api/exercises/rodada` | `UPDATE vocab_cards SET difficulty_score…` ×10 (um por cartão) | já vai num único `batch` (uma ida, uma transação): mantido |
| `POST /api/import/anki`, `POST /api/anki/decks/:id/ativar` | inserts/updates ×3 | são os lotes de `server/db/lotes.ts` (teto de variáveis): intencional |
| `GET /api/me`, `/api/me/entitlements`, `PATCH /api/me` | `select … from users` ×3 (`isSuspended` + `ensure`) | ~0,1–0,25 ms cada; não corrigido (o `ensure` escreve e relê) |
| `POST /api/billing/assinar`, `GET /api/me/uso` | ×3–×4 em tabelas pequenas | < 1 ms; aceito |

**Custo fixo de toda requisição autenticada** (instruções que aparecem em todas): `users` (suspensão), `idades_declaradas`
(idade), `usage_counters` (limitador persistido) e, nas escritas, o upsert em `usage_counters` — 0,07–0,17 ms cada no
banco por rota.

### 2.2 Rotas — suíte de carga (100 e 1.000 VUs)

`node scripts/perf/suite/rodar.mjs --vus=<N> --duracao=60 --rampa=15`, rodadas A/B com o mesmo banco. **Leia com a
coluna "outros núcleos"**: é ela que decide o resultado.

| Rodada | VUs | req/s | erro % | leitura p50/p95/p99 ms | gravação p50/p95/p99 ms | IA sobre o provedor p95 | CPU srv % | CPU-ms/req | RSS MB | outros núcleos | SLO |
|---|---:|---:|---:|---|---|---:|---:|---:|---:|---:|---|
| antes | 100 | 10,7 | 0 | 5,4/14,3/90,2 | 7,1/13,5/52 | 11,4 | 10,6 | 9,91 | 327 | 6,9 | dentro |
| depois | 100 | 10,7 | 0 | 7,2/26,1/58,8 | 9,9/26,3/77,9 | 23,5 | 12,2 | 11,4 | 329 | 10,0 | dentro |
| antes (1ª) | 1.000 | 106,3 | 0 | 17,8/1.222/4.265 | 19,4/2.708/5.243 | 3.123 | 68,8 | 6,47 | 543 | 8,4 | fora |
| depois (1ª) | 1.000 | 99,3 | 0 | 497/1.735/2.911 | 558/1.973/3.102 | 2.007 | 78,3 | 7,89 | 690 | 10,8 | fora |
| **depois (2ª, ordem invertida)** | 1.000 | 103,3 | 0 | **5,8/65,7/205,5** | **7,0/60,4/208,6** | **44,3** | 52,3 | **5,06** | 604 | **5,0** | **dentro** |
| antes (2ª) | 1.000 | 101,9 | 0 | 11,9/203,1/312,5 | 13,3/210,5/320,6 | 191,4 | 61,8 | 6,06 | 526 | 7,4 | fora (IA) |

Conclusão honesta: a mesma versão foi de "fora do SLO" a "dentro" entre rodadas, e a CPU-ms/req acompanha os outros
núcleos (5,06 com 5,0 · 6,06 com 7,4 · 6,47 com 8,4 · 7,89 com 10,8), não a versão. **A suíte não distingue antes de
depois nesta máquina e neste momento**, o que é o esperado: nenhuma das três correções está no caminho que a
mistura realista exercita com frequência. Referência da Fase 4 (máquina quieta, 25/09): p95 de leitura 21 ms com
1.000 VUs.

**Por rota, dentro da suíte** (2ª rodada de 1.000 VUs, a mais limpa; instruções e ms de banco pelo coletor):

| Rota | p50 / p95 ms antes | p50 / p95 ms depois | instr./req antes → depois | instr. máx | ms de banco/req (depois) |
|---|---|---|---|---:|---:|
| GET /api/settings | 10,1 / 222,2 | 3,9 / 54,3 | 5 → 5 | 5 | 1,21 |
| GET /api/metrics/profile | 12,9 / 186,8 | 6,1 / 63,7 | 10,67 → 10,77 | 12 | 9,67 |
| GET /api/vocab | 13,6 / 203,1 | 6,5 / 76 | 6,01 → 6,05 | 7 | 9,29 |
| GET /api/sessions | 8 / 193,1 | 3,5 / 52,7 | 4 → 4 | 4 | 1,06 |
| GET /api/vocab/para-jogo | 12,1 / 213,5 | 6,4 / 53,7 | 5 → 5 | 5 | 4,44 |
| POST /api/vocab/:id/review | 11,5 / 221,5 | 5,9 / 64,4 | 9 → 9 | 9 | 4,57 |
| POST /api/exercises/rodada | 11,8 / 212,3 | 6,1 / 66,3 | 20 → 19,54 | 20 | 9,27 |
| POST /api/metrics/seeds/gastar | 15,5 / 215,4 | 9,2 / 64,5 | 15,46 → 16,27 | 18 | 15,67 |
| POST /api/sessions | 16 / 197,2 | 7,8 / 50,6 | 10,01 → 10 | 10 | 7,05 |
| POST /api/ai/stt (sobre o provedor) | p95 246,9 | p95 54,1 | **7,86 → 6,23** | 11 | 1,56 |
| POST /api/ai/mt (sobre o provedor) | p95 76,1 | p95 36,7 | **8,51 → 6,42** | 11 | 1,47 |

(As latências antes/depois desta tabela herdam o ruído acima; as colunas de instruções não — são contagem.)

### 2.3 Rotas — `carga-servidor.mjs` por rota

`node scripts/perf/escala/carga-servidor.mjs --modo=publico --conexoes=10,50 --conexoes-lentas=1,10 --duracao=10`,
200 usuários pesados em rodízio (cada requisição de `vocab`/`profile` é, na prática, a PRIMEIRA daquele usuário:
caminho frio). CPU/req = CPU média do servidor (% de um núcleo) × 10 ÷ req/s. Bundle depois:

| Rota | conexões | req/s | p50 / p95 ms | CPU % | **CPU-ms/req** | instr./req | ms de banco/req | loop máx ms |
|---|---:|---:|---|---:|---:|---:|---:|---:|
| GET /api/abertura | 10 | 4.263 | 1,8 / 5,0 | 81 | 0,19 | 0 | 0 | 36 |
| GET /api/settings | 10 | 720 | 12,7 / 21,4 | 113 | 1,57 | 5 | 0,38 | 25,6 |
| GET /api/settings | 50 | 723 | 67,2 / 89,4 | 109 | 1,51 | 5 | 0,38 | 88,4 |
| GET /api/sessions | 10 | 475 | 19,4 / 31,9 | 102 | 2,15 | 4 | 0,52 | 37,8 |
| GET /api/sessions | 50 | 526 | 92,0 / 133,2 | 107 | 2,03 | 4 | 0,52 | 120,4 |
| GET /api/metrics/profile (frio → quente) | 1 | 103 | 1,8 / 56,4 | 93 | 9,03 | 7,14 | 1,61 | 94,7 |
| GET /api/metrics/profile (quente) | 10 | 619 | 15,3 / 22,8 | 108 | 1,74 | 7,14 | 1,61 | 24,9 |
| **GET /api/vocab (frio, 3.000 cartões)** | 1 | 6 | 156 / 193,6 | 55 | **91,7** | 7 | **93,7** | 222 |
| **GET /api/vocab (frio)** | 10 | 8 | 1.190 / **1.463** | 72 | **90,0** | 7 | 93,7 | 1.190 |
| POST /api/vocab/:id/review | 10 | 182 | 51,8 / 79,1 | 92 | 5,05 | 9 | 2,47 | 101,7 |
| POST /api/vocab/:id/review | 50 | 186 | 229 / 437,5 | 87 | 4,68 | 9 | 2,47 | 522 |
| POST /api/metrics/seeds/gastar | 1 | 202 | 4,5 / 6,9 | 93 | 4,60 | 12 | 1,63 | 193 |
| POST /api/metrics/seeds/gastar | 10 | 232 | 39,2 / 69,5 | 95 | 4,09 | 12 | 1,63 | 108 |

Ponto de quebra (p95 > 1 s): **só `GET /api/vocab` frio, com 10 conexões**. Uma rodada com o bundle antes deu os mesmos
planos e as mesmas instruções por requisição em todas as rotas, mas cada consulta ~2× mais lenta por igual (ex.: a
leitura dos cartões do perfil, 80,8 → 25,3 ms médios, com o MESMO plano) — de novo a máquina, não o código.

## 3. Correções (TDD, antes → depois)

### 3.1 P0 — índices do lado filho de toda FK (migração `0034_indices_das_chaves_estrangeiras.sql`)

Teste primeiro: `tests/integration/fk-com-indice.test.ts` aplica as migrations reais num banco vazio com
`foreign_keys = ON` e cobra (1) índice com a coluna filha na FRENTE para toda FK, (2) o plano de
`DELETE FROM utterances …`, `DELETE FROM sessions …` e `DELETE FROM vocab_cards …` sem `SCAN` e sem `ANY(` (skip-scan).
Vermelho com 4 FKs sem índice; vermelho de novo quando a primeira versão aceitava skip-scan e a medição mostrou que
não bastava; verde com os oito índices.

**EXPLAIN antes → depois** (banco da suíte):

| Instrução | Antes | Depois |
|---|---|---|
| `DELETE FROM utterances WHERE session_id=? AND user_id=?` | `SEARCH utterances USING INDEX idx_utt_session` / **`SCAN vocab_occurrences`** | … / `SEARCH vocab_occurrences USING COVERING INDEX idx_occ_utterance (utterance_id=?)` |
| `DELETE FROM sessions WHERE id=?` | … / `SEARCH vocab_cards USING COVERING INDEX idx_vocab_session (`**`ANY(user_id)`**` AND session_id=?)` / … / **`SCAN exercise_results`** | … / `idx_vocab_session_id (session_id=?)` / … / `idx_exercise_results_session (session_id=?)` |
| `DELETE FROM vocab_cards WHERE id=?` | … / **`SCAN anki_notes`** / … / `idx_exercise_results_card (`**`ANY(user_id)`**` AND card_id=?)` / `idx_occ_probe (`**`ANY(user_id)`**` AND card_id=?)` | … / `idx_anki_notes_projected_card` / … / `idx_exercise_results_card_id (card_id=?)` / `idx_occ_card (card_id=?)` |

**Medido** (`medir-exclusoes.mjs`, cópia do banco da suíte, PRAGMAs de produção):

| Operação | Antes | Só as 4 FKs sem índice | Depois (8 índices) |
|---|---:|---:|---:|
| DELETE das 100 falas de `s-u-p-0003-0` | 17.019 ms (15.467 na 1ª medida) | 2,2 ms | **0,9 ms** |
| exclusão da conta `u-m-0005` (150 cartões, 80 falas, 2 sessões) | 19.466 ms (falas 13.117, cartões 5.346, sessões 985) | 7.415 ms (cartões 7.367) | **8,8 ms** |
| exclusão da conta `u-p-0004` (3.000 cartões, 2.000 falas, 20 sessões) | **530.915 ms** (falas 359.074, cartões 168.411, sessões 3.303) | 155.214 ms (cartões 154.101 — ~51 ms/cartão de skip-scan) | **171 ms** |
| aplicar a 0034 (uma vez, no boot do deploy) | — | 358 ms (4 índices) | 1.997 ms (8 índices) |

Quem pagava isso em produção: "retomar captura" (`sessionsRepo.replaceUtterances`, `server/db/repositories/sessions.ts:201`),
`DELETE /api/me` (`contaRepo.excluir`, `server/db/repositories/conta.ts:275`), os dois com o event loop preso pela
duração inteira. (A limpeza de convidados, `server/lib/limpezaDeConvidados.ts`, só apaga `convidados` e `usage_counters`,
que não são pai de nenhuma FK — não era afetada.)

**Custo na escrita** (`insert` isolado, 200 rodadas intercaladas, p50/p95 ms): 20 ocorrências 0,726/1,352 → 0,779/1,456;
1 revisão 0,184/0,368 → 0,181/0,326; 20 falas 0,569/0,898 → 0,575/1,028; 10 exercícios 0,511/0,814 → 0,569/1,372.
Os parciais (`WHERE coluna IS NOT NULL`) não indexam as linhas sem a coluna (ocorrências do Anki sem fala, exercícios
fora de sessão), por isso o custo fica nessa ordem.

### 3.2 P1 — boot: migração Leitner→FSRS (`0035_indice_da_migracao_leitner.sql`, `server/db/manutencao.ts`)

Teste primeiro: `tests/integration/leitner-boot-barato.test.ts` — com 40 candidatos, a migração faz no máximo 2 chamadas
ao banco (era 41: 1 SELECT + 40 UPDATEs), e o plano da leitura dos candidatos usa `idx_vocab_leitner_pendente`.

- Índice parcial `ON vocab_cards(id) WHERE deleted_at IS NULL AND stability IS NULL AND box > 1` — quase sempre vazio
  (carta nova nasce com `box = 1`; a primeira revisão grava `stability`), então não custa escrita.
- A consulta repete o predicado **literal**. Com `gt(box, 1)` o Drizzle gera `box > ?`, e o SQLite só consegue provar o
  WHERE do índice parcial quando conhece o valor: com o parâmetro ligado a NULL o plano volta a `SCAN vocab_cards`
  (conferido; com o valor 1 ligado antes da preparação ele usa o índice — dependência que não vale deixar implícita).
- Lê só as 8 colunas que `toState` usa (era `SELECT *`) e grava em `db.batch` de 1.000 (uma transação cada), não um
  `await` por cartão.

| Medida | Antes | Depois |
|---|---:|---:|
| EXPLAIN da leitura dos candidatos | `SCAN vocab_cards` | `SCAN vocab_cards USING INDEX idx_vocab_leitner_pendente` |
| a leitura, isolada, nada a migrar (453.000 cartões, 7 execuções) | 226,7 ms mediana (194,9 mín.) | 0,03 ms |
| banco no boot, nada a migrar (coletor) | 227–247 ms quente; 559 ms frio (504 da leitura) | 4,9 ms |
| banco no boot com 5.000 legados | 1.993 ms (5.000 UPDATEs: 1.911 ms) | 827 ms (UPDATEs 708 + 6 COMMIT 79) |
| tempo de subida até `/api/health` (3 × 3 intercalados, medianas) | 2.386 / 2.220 / 2.105 ms | 2.173 / 2.230 / 2.253 ms |

O tempo de subida não mudou de forma mensurável: o ruído entre execuções (±200 ms) é do tamanho do ganho. O que ele
esconde está na §4.2.

### 3.3 P2 — o plano lido uma vez por requisição (`server/lib/contextoDeConvidado.ts`, `server/lib/entitlements.ts`)

Teste primeiro: `tests/integration/plano-uma-vez-por-requisicao.test.ts` (3 perguntas no mesmo request → 1 leitura de
`subscriptions`; requests diferentes, outro usuário e fora de request continuam lendo). Vermelho: 3 leituras.

`memoDoRequest(userId, chave, ler)` guarda a promessa no contexto que o `authMiddleware` já abre (`comIdentidade`), só para
o PRÓPRIO usuário do request, e tira do memo a leitura que falha. `getPlanForUser` passa a usá-lo. Nenhuma rota que ESCREVE
em `subscriptions` lê o plano pela mesma função na mesma requisição (conferido: `billing.ts` e `admin.ts` usam
`subscriptionsRepo.getActive` direto). Efeito medido pelo coletor na suíte: STT 7,86 → 6,23 e MT 8,51 → 6,42 instruções por
requisição.

## 4. IA sem o provedor e boot

### 4.1 Rotas de IA sem o provedor (admissão, cotas, telemetria)

- **Banco**: STT 1,56 ms e MT 1,47 ms de banco por requisição (1.000 VUs, depois), com 6,2–6,4 instruções: autenticação
  (`users`, `idades_declaradas`), limitador (`usage_counters`), plano (agora 1× `subscriptions`), reserva de cota e o gasto de IA
  (`gasto_de_ia`, `select … where mes=?`, 0,59 ms médio). Máximo de 11 instruções numa requisição (a admitida, com reserva e
  estorno).
- **"Sobre o provedor"** (latência medida − o que o provedor falso segurou): p95 11,4 ms (100 VUs) e 44,3 ms (1.000 VUs) na
  rodada mais limpa, dentro do SLO de 100 ms; 191–3.123 ms nas rodadas com 7–11 núcleos ocupados por outros processos. A
  maior parte das respostas é a recusa da admissão (`429 nuvem_ocupada`: 469 de 501 STT e 397 de 424 MT a 1.000 VUs, com o
  provedor falso limitando a 20 RPM), e ela custa pouco: `responderNuvemOcupada` soma 385 ms de CPU em 60 s, 233 deles em
  `writev` (a escrita da resposta).
- **Telemetria**: o rastro de IA (`abrirRastro`, `server/ai/telemetriaDeIa.ts:177`) resolve o plano num `void` depois da
  resposta (`telemetriaDeIa.ts:217`), ainda dentro do contexto do request; com o memo, cai na mesma leitura.

### 4.2 Boot

`scripts/perf/arranque.mjs` (spawn → `/api/health` 200) e perfil de CPU do boot (`CPU_PROF_INICIO=1`), banco da suíte com
todos os cartões migrados:

| Onde vai o boot (antes, perfil de 4.497 ms ocupados) | ms | % |
|---|---:|---:|
| carregar módulos (`node:internal`, `internalModuleStat`, `lstat`, `readFileUtf8`, `wrapSafe`) | ~2.650 | ~59 |
| `libsql` (quase tudo a leitura dos candidatos Leitner) | 820 | 18 |
| `jsdom` + `css-tree` carregados no boot (dependências de `server/import/web.ts`) | 166 | 4 |
| `scryptSync` (derivação da chave em `server/crypto.ts`) | 110 | 2 |

Depois da 0035 o banco do boot cai para 4,9 ms; o boot passa a ser quase só carregamento de módulos (~2,2 s medidos).

## 5. Hotspots do perfil de CPU e o que ficou sem correção

**Tempo próprio por origem** (janela de 60 s):

| Origem | antes, 100 VUs (34.785 ms ocupados) | depois, 1.000 VUs (59.223 ms ocupados) |
|---|---:|---:|
| `libsql_js::statement::Rows::js_next` (o SQLite executando + materializando) | 13.120 (37,7 %) | 29.900 (**50,5 %**) |
| `drizzle-orm` (montar SQL, `is()`, mapear linhas) | 4.432 (12,7 %) | 7.353 (12,4 %) |
| código do servidor | 1.588 (4,6 %) | 5.150 (8,7 %) |
| `libsql` + `@libsql/client` (JS do driver: `columns()` 2× por execução, `rowFromSql`) | 2.912 (8,4 %) | 5.277 (8,9 %) |
| `writev` (escrever respostas) | 785 | 1.747 |
| coletor + inspector (a própria instrumentação) | 1.568 (4,5 %) | 1.775 (3,0 %) |
| `express`, `jose` | 788, 603 | 818, 579 |

**Tempo inclusivo do código do servidor** (1.000 VUs): `createWithUtterances` 4.252 ms (7,2 %; 2.922 deles no SQLite —
20 falas × 3 índices + gatilho de versão + COMMIT de 2,2 ms médio), leitura compacta 2.095 ms (dos quais 1.266 no
`JSON.parse` do resultado), `recalcularDificuldade` 1.615 ms, `authMiddleware` 1.070 ms, `computeProfile` 893 ms, e o
handler de `GET /api/vocab` 892 ms de tempo próprio — o `JSON.stringify` do baralho no caminho frio.

**Sem correção nesta branch, com número:**

1. **`GET /api/vocab` frio** — 90–103 ms de CPU e 93,7 ms de banco por chamada com 3.000 cartões (§2.3); quebra com 10
   conexões simultâneas em usuários diferentes. O corpo passa por DUAS serializações: o SQLite monta o JSON compacto, o JS o
   lê (`JSON.parse`), refaz os objetos e serializa de novo (`JSON.stringify`) — ~2,8 s de 59,2 s de CPU a 1.000 VUs. Montar o
   JSON final no SQLite não preserva o corpo byte a byte (a formatação de reais do SQLite não é a do JS; é por isso que
   `server/db/leituraCompacta.ts` usa `printf('%!.17g')` e reparse). Caminho: sincronização incremental por `updated_at`
   desde a versão que o cliente tem, em vez de baralho inteiro.
2. **`cortesDeFaixa`** (`GET /api/vocab/para-jogo`, `vocab.ts:752`) lê as 3.000 dificuldades do usuário a cada chamada:
   8,6 ms isolado. Testados e recusados: quantis por função de janela no SQLite (13,1–13,9 ms, pior) e índice parcial
   `(user_id, difficulty_score) WHERE deleted_at IS NULL` (5,7–6,3 ms, mais um índice em toda escrita de cartão para
   ~3 ms). Cache por versão também não ajuda: toda rodada grava e muda a versão antes da próxima seleção.
3. **Import Anki** lê até 40.000 notas de um baralho por lote (p95 214–236 ms nos testes); a rota já está no
   `expensiveLimiter`.
4. **Boot**: `jsdom`/`@mozilla/readability` podem ir para `import()` dentro da rota de importação web (~166 ms de CPU só
   de tempo próprio, mais o carregamento); não feito porque o ganho é do tamanho do ruído da medição de subida.
5. **`users` ×3 em `/api/me`**: `isSuspended` + `ensure` (que escreve e relê) — 0,1–0,25 ms cada; memo exigiria invalidar
   depois da escrita.

## 6. Commits e gates

| Commit | O quê |
|---|---|
| `7204018` | migração 0034 (8 índices), `schema.ts`, snapshot 0034, `tests/integration/fk-com-indice.test.ts`, `fks-sem-indice.mjs`, `medir-exclusoes.mjs` |
| `218df40` | migração 0035, `migrarLeitnerParaFsrs` por índice parcial e em lote, snapshot 0035, `tests/integration/leitner-boot-barato.test.ts` |
| `c1bb464` | `memoDoRequest` + `getPlanForUser`, `tests/integration/plano-uma-vez-por-requisicao.test.ts` |
| (este) | `scripts/perf/consultas/` (coletor, análise, perfil, resumo), `--coletor-dir`/`--cpu-prof-dir` na suíte e no `carga-servidor`, este relatório |

| Gate | Resultado |
|---|---|
| `tsc --noEmit` | 0 erros |
| `eslint src server server.ts tests --max-warnings 0` | 0 |
| `vitest run --maxWorkers=3` | 494 arquivos, 5.052 testes passando + 26 pulados; 3 arquivos (`caracterizacao/flags`, `caracterizacao/idade-e-convite`, `integration/snapshot-processo-filho`) estouraram o timeout de hook/teste com a máquina carregada e passaram (31/31) rodados de novo |
| `npm run build` | ok |
| `node scripts/testes/contrato-api.mjs` | 99 rotas, nenhuma removida |
| `node scripts/migracoes/conferir.mjs` | 36 migrations, 6 conferidas (≥ 0030), 0 erros |
| `tests/integration/schema-igual-ao-banco.test.ts` | verde (índices parciais conferidos no `sqlite_master`) |

## 7. Reproduzir

```bash
npm run build
node scripts/perf/suite/preparar.mjs --db=<tmp>/base.db --pesados=50 --medios=2000
# inventário na suíte de testes (um arquivo por processo em <dir>)
COLETOR_DIR=<dir> COLETOR_SINCRONO=1 NODE_OPTIONS="-r ./scripts/perf/consultas/coletor.cjs" \
  npx vitest run tests/caracterizacao tests/integration --maxWorkers=3
node scripts/perf/consultas/analisar.mjs --dir=<dir> --db=<tmp>/base.db --md=inventario.md
# suíte de carga com coletor e perfil de CPU da janela
node scripts/perf/suite/rodar.mjs --vus=100,1000 --tmp=<tmp> --coletor-dir=<c> --cpu-prof-dir=<p> --sem-veredito
node scripts/perf/consultas/resumir-perfil.mjs <p>/nivel-1000/servidor-*.cpuprofile --req=<requisições>
# FKs e DELETEs físicos (numa CÓPIA: o script apaga linhas)
node scripts/perf/consultas/fks-sem-indice.mjs --db=<tmp>/base.db
node scripts/perf/consultas/medir-exclusoes.mjs --db=<tmp>/copia.db [--com-0034]
# comparar com o bundle anterior: MIGRATIONS_DIR=<migrations dele> ... --bundle=<bundle antigo>
```
