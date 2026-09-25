# Prontidão para produção — Fase 2: escala e isolamento (25/09/2026)

Branch `auditoria/prontidao-producao`. Medições feitas com os scripts versionados em `scripts/perf/escala/`
(servidor = bundle de produção, `NODE_ENV=production`, `AUTH_REQUIRED=1` com JWKS ES256 local — o
`authMiddleware` real verifica cada token). Resultados brutos no scratchpad da sessão; os números abaixo são
os que decidem.

## 0. Já corrigido nesta fase (aprovado no gate 1)

| P0 | Correção | Commit |
|---|---|---|
| P0-2 cota de STT forjável | taxa derivada de `sampleRate × canais × bits`, PCM coerente; ilegível 415, >60 s 413, antes da reserva | `7c601a6` |
| P0-3 cliente escolhia o modelo | `x-model` ignorado na chave do app | `7c601a6` |
| P0-5 deploy sem gate | `deploy.yml` exige `ci.yml` verde no SHA exato; emergência com justificativa registrada | `6daefe5` |
| P0-7 API sem 404 nem versão | 404 JSON em `/api/*`; `x-babel-versao` + `/api/health.versao`; aviso "Atualizar" no cliente; versão na tela Sobre | `fe7baa4` |

Gates após o merge: tsc 0, eslint 0, vitest 438 arquivos / 4.595 testes, 0 falhas.

## 1. Ambiente e correção

Medido num Ryzen 5 5600 (1 núcleo por processo, Windows). Produção: Fly `shared-cpu-1x` = **6,25% de um núcleo
sustentado**, rajada com saldo de até 500 s ([Fly CPU performance](https://fly.io/docs/machines/cpu-performance/)).
Carga sustentada em produção ≈ medido × 0,0625. Não medido: velocidade relativa do núcleo do Fly (usado ×1,
otimista), disco Linux, RSS do Litestream, PUT no R2.

## 2. Medições

### 2.1 Servidor real, modo público (autocannon, 15 s por nível; sem erro de socket nem 5xx)

| Rota | CPU por req | Vazão (1 núcleo) | Quebra (p95 > 1 s) |
|---|---|---|---|
| `GET /api/settings` (só o custo fixo) | 1,8 ms | 549 req/s | não quebrou até 200 conexões (p95 382 ms) |
| `GET /api/sessions` | 2,1 ms | 445 req/s | não quebrou até 200 |
| `POST /api/vocab/:id/review` | 3,7 ms | 193–249 req/s | não quebrou até 200 (p95 905 ms) |
| `GET /api/metrics/profile` | **77 ms** | 13 req/s | **50 conexões** (p95 4,3 s) |
| `GET /api/vocab` (3.000 cartões, 2,3 MB) | **133 ms** | 7 req/s | **10 conexões** (p95 1,8 s) |
| `POST /api/metrics/seeds/gastar` | **154 ms** | 6 req/s | **10 conexões** (p95 1,76 s) |

- Custo fixo por request autenticado: **1,26 ms**; a verificação do JWT ES256 é 0,12 ms (10%). O resto é banco.
- **O driver libsql prende o event loop pela duração inteira da consulta** (uma `list` de 115,6 ms abriu um
  buraco de 117,6 ms entre batimentos de 1 ms). Três rotas caras bastam para travar todos os usuários.
- RSS: 290–300 MB em repouso, 470–590 MB sob carga.

### 2.2 SQLite com o driver real (`micro-sqlite.ts`)

Escritor único: 654–1.275 pares incremento+estorno/s e 1.035–3.515 reservas de cota/s (p95 < 1,5 ms). Revisão
FSRS: 62–169/s, p99 até 2,2 s sob contenção de WAL. Em série no Fly sustentado: ~80–160 escritas/s.

### 2.3 Memória por upload (`upload-memoria.mjs`)

| Uploads simultâneos de 120 MB | 1 | 2 | 3 | **4** | 8 |
|---|---|---|---|---|---|
| RSS de pico | 538 MB | 763 MB | 893 MB | **1.011 MB** | 1.494 MB |

O corpo existe **duas vezes** em memória (241 MB de arrayBuffers por upload de 120 MB) e o RSS não volta ao
repouso em 4 s. O STT de 25 MB lê o corpo inteiro **antes** de recusar por plano (402) ou configuração (501).

### 2.4 Snapshot diário dentro do processo (`snapshot-bloqueio.ts`)

| Banco | Snapshot | Maior bloqueio contínuo do event loop | Δ RSS |
|---|---|---|---|
| 46 MB | 7,1 s | 3,7 s | +71 MB |
| 191 MB | 34,9 s | **20,1 s** | +243 MB |
| 479 MB | 68,8 s | **34,3 s** | **+587 MB** (pico 1.022 MB) |

Qualquer bloqueio acima de 5 s derruba o `/api/ready` (`fly.toml:81`) e o Fly tira a única máquina do ar.

### 2.5 Achado novo: um IP compartilhado fica bloqueado por 15 minutos (P0)

Com todo o tráfego vindo de um só IP (escola, NAT, operadora móvel — o público-alvo), o limitador anti-força-bruta
(`server/http/app.ts:~360`, `skipSuccessfulRequests`, 30 por 15 min) conta **na entrada** e estorna **na
saída**. Com mais de 30 requisições em voo: 50 conexões → 88,8% de 429; 100–200 → 97–100%. Depois da rajada o
contador ficou **preso em 30**, e uma rodada com **1 conexão recebeu 5.055 de 5.055 respostas 429**. Uma sala de
aula abrindo o app ao mesmo tempo bloqueia a escola inteira por 15 minutos.

## 3. Tabela de capacidade

Hipótese: pico com 10% dos cadastrados simultâneos; 30% deles capturando (10 STT + 10 MT por minuto); os demais
navegando/jogando (6 req/min, com 1 `vocab` + 1 `profile` por minuto). Daí: **0,017 × U req/s**,
**0,3 × U STT/min**, **0,000274 × U núcleos**, **~0,076 × U escritas/s**, banco ~3,9 MB por usuário pesado.

| Cadastrados | Simultâneos | req/s | CPU vs base do Fly | STT/min (Groq grátis: 20) | O que quebra primeiro | Precisa mudar antes |
|---|---|---|---|---|---|---|
| **10** | 1 | 0,17 | 4% | 3 | **Limites diários do Groq** (1.000 pedidos/dia e 200K tokens/dia acabam em 2,5–5,5 h de pico); **4 uploads simultâneos** derrubam a máquina; **IP de escola bloqueado** | isolamento de memória (§4.1), limitador de IP (§4.2), fila/degradação de IA (§4.3) |
| **100** | 10 | 1,7 | 44% | **30 > 20** | **Groq por minuto** (a partir de ~67 cadastrados); **snapshot** com banco de ~400 MB trava 20–34 s e soma +1,2× o banco na RAM | Groq Developer (pendência do dono) ou fila com prioridade; snapshot fora do processo; `/api/vocab` e `profile` baratos |
| **1.000** | 100 | 17 | **4,4× a base** | 300 | **CPU do Fly**: o saldo de rajada acaba em ~40 min de pico; banco ~3,9 GB | CPU dedicada (`performance-1x`, 2 GB); cache/paginação em `vocab`, `profile`, `gastar`; limitador fora do banco |
| **10.000** | 1.000 | 170 | 2,7 núcleos | 3.000 | CPU de um processo, escritor único (~760 escritas/s), volume (39 GB > teto de 10 GB) | Postgres + várias réplicas (ADR 0006); fila compartilhada (ADR 0007); limitador em memória compartilhada |

**Leitura:** até 1.000 cadastrados a **CPU quebra antes do banco** — trocar de banco sem baratear as rotas caras
e sem CPU dedicada não resolve. O SQLite de escritor único deixa de bastar entre **1.000 e 2.000 cadastrados no
Fly sustentado** (teto ~80–160 escritas/s contra ~76–152 exigidas) e com folga só até ~1.000 em CPU dedicada.

## 4. Isolamento (noisy neighbor) e trabalho pesado

### 4.1 Memória: um usuário derruba todos (P0-1 confirmado por medição)
- Corpos grandes em **streaming** direto para o R2/arquivo temporário, sem `express.raw` (áudio da sessão, Anki).
- **Semáforo de corpos grandes**: no máximo 1 em voo por usuário e 2 por processo; excedente recebe 429 com
  `Retry-After`. Checagem de plano/configuração **antes** de ler o corpo (STT, import).
- Import Anki em lote e fora do caminho da requisição (§4.3); corrigir o limite de 32.766 variáveis (sessão com
  >1.927 falas, Anki com >32.766 notas) com inserção em lotes.

### 4.2 Limites por usuário e por IP
- Limitador anti-força-bruta **conta só o 401 na saída** (sem incremento-e-estorno), com teto por IP maior e
  janela curta; teste de regressão com 200 requisições simultâneas de um IP.
- Rate limit das rotas caras continua por usuário (60/min, no banco) — hoje correto.
- Faltam: duração máxima do upload de áudio de sessão; checagem de plano no import Anki; timeouts HTTP do servidor
  (`requestTimeout`, `headersTimeout`) e das saídas para S3/Admin API do Supabase.

### 4.3 Trabalho pesado de IA — desenho (ADR 0007)
A legenda ao vivo é tempo real: uma fila durável que atrasa 10 s não serve — é melhor degradar para o motor local.
Por isso **controle de admissão em memória** agora, fila durável só para lote (importação):
- **Orçamento por provedor e modelo** (token bucket com os limites da conta: 20 RPM STT, RPD e TPD) consultado
  antes de chamar; sem saldo → 429 `nuvem_ocupada` com `Retry-After`, e o cliente cai no motor local **na hora**.
- **Prioridade por plano**: Pro > Essencial > convidado; convidado só usa o saldo que sobra acima de uma reserva.
- **Uma chamada de STT em voo por usuário**; MT até 2.
- **Disjuntor também no STT**, respeitar `Retry-After`, sem retentativa em 429 (hoje cada 429 vira 3 pedidos).
- **Degradação no cliente**: 402/429/503 desligam a nuvem só por um período curto (ex.: 60 s) e religam; 5xx
  isolado não desliga mais a sessão inteira de quem paga.
- **Importação na nuvem**: tabela `jobs` no próprio banco (idempotência pela chave do pacote, retry com backoff,
  prioridade por plano), consumida por um worker no mesmo processo com concorrência 1. Vira fila compartilhada
  quando houver mais de um processo (ADR 0006).

### 4.4 Estado entre réplicas
Hoje o app **não é stateless**: rate limit, cotas, orçamento e ranking vivem no SQLite local; disjuntor, cache de
tradução, aviso de 429, fila do Langfuse e métricas vivem na memória do processo (lista em
`fase1-mapeamento.md` §4). Decisão: **uma máquina até o gatilho do ADR 0006**; a trava de boot passa a recusar
`REPLICAS>1` com banco local (hoje só olha o armazenamento de áudio, `diretorios.ts:61-71`).

### 4.5 Armazenamento (ADR 0009)
- Áudio em Opus 24 kbps ≈ **11 MB/h**. Pior caso por plano/mês: Essencial 15 h ≈ **165 MB**, Pro 20 h ≈ 220 MB;
  retenção de 90 dias → teto ~0,5–0,7 GB por assinante pesado. Banco: ~3,9 MB por usuário pesado.
- R2 obrigatório em produção (já implementado), sem egress pago; áudio servido do R2.
- Faltam: **varredura de órfãos** (hoje só remove o anterior ao substituir, `sessions.ts:264`), **backup da mídia**,
  índice em `sessions(created_at)` para a retenção (hoje `LIKE` em `meta`), e o `/api/ready` não pode depender do R2
  (uma falha do R2 tira a única máquina do ar).

## 5. Classificação atualizada

**P0 abertos (antes de qualquer usuário):**
1. Memória: 4 uploads derrubam a máquina (§2.3, §4.1).
2. IP compartilhado bloqueado por 15 min (§2.5, §4.2).
3. Snapshot trava o event loop 20–34 s e derruba o health (§2.4) → snapshot fora do processo ou só Litestream.
4. Capacidade de IA do Groq grátis + reserva expirada: admissão, prioridade e degradação (§4.3). O upgrade é
   pendência do dono; o código tem que degradar bem sem ele.
5. Alertas e coleta de métricas (Fase 5) e restauração testada (Fase 6) — mantidos da Fase 1.

**P1:** event loop preso pelo driver síncrono nas rotas caras (`vocab` 133 ms, `profile` 77 ms, `gastar` 154 ms de
CPU) · limites de 32.766 variáveis · `/api/ready` depende do R2 · STT sem disjuntor e retry que triplica 429 ·
trava de boot deixa passar `REPLICAS>1` com SQLite · revisão FSRS não atômica · orçamento global não atômico.

**P2:** timeouts HTTP; índices (`exercise_results(user_id, created_at)`, `usage_counters(metric, window)`,
`sessions(created_at)`); varredura de órfãos; backup de mídia.

## 6. Plano de correção proposto para a próxima etapa (depende do gate)

| Ordem | Item | Esforço |
|---|---|---|
| 1 | Limitador de IP só conta 401 na saída + teste de 200 simultâneas | P |
| 2 | Semáforo de corpos grandes + streaming do áudio da sessão para o R2 + checagem antes de ler o corpo | M |
| 3 | Snapshot fora do event loop (`sqlite3 .backup` em processo filho + gzip em stream) e `/api/ready` sem R2 | M |
| 4 | Admissão de IA: token bucket por provedor, prioridade por plano, 1 STT em voo por usuário, disjuntor no STT, sem retry em 429, degradação temporária no cliente | M |
| 5 | Lotes para o limite de variáveis (sessões e Anki) | P |
| 6 | `vocab`, `profile`, `gastar` baratos: paginação/ETag no `vocab`, agregados incrementais no perfil | G |
| 7 | Trava de boot contra multi-réplica com SQLite; timeouts HTTP; índices | P |

## 7. Correções aplicadas (aprovadas no gate 2, 25/09/2026)

| Item | Resultado medido | Merge |
|---|---|---|
| 1. Limitador de IP | 200 requisições simultâneas autenticadas do mesmo IP: **0 respostas 429** (antes 21/200 no teste e 88–100% na carga) e nenhuma escrita no contador; 429 só depois de 30 respostas 401 | `ca55192` |
| 2. Uploads grandes | 4 uploads de 120 MB em voo: RSS de pico **966 → 339 MB**; semáforo de 1 por usuário e 2 por processo (429 `upload_ocupado`); dono, tamanho e cota checados antes de ler o corpo; S3 com prazo | merge de `fix/uploads-streaming` |
| 3. Snapshot e ready | maior bloqueio do event loop durante o backup: **3.846 ms → 7–15 ms** (46 MB) e **20,1 s → 28 ms** (191 MB); gzip em streaming num processo filho; R2 fora deixa `/api/ready` em 200 `degradado` | `2b1430f` |
| 4. Admissão de IA | 25 STT simultâneos com balde de 20/min: 20 atendidos, 5 com 429 `nuvem_ocupada` e **0 retentativas**; Pro antes de Essencial; 1 STT em voo por usuário; disjuntor no STT; 402 sem ler o corpo; cliente pausa a nuvem pelo `Retry-After` e volta sozinho | `fdd57ae` |
| 5. Teto de variáveis | sessão de 5.000 falas grava; Anki de 40.000 notas **2,5–5,9 s** (antes falhava; 30.000 notas levavam 48,5 s); relabel de 5.000 cartões ~15 s → ~1 s | `1d4a034` |
| 7. Réplicas, índices | boot recusa `REPLICAS>1` com SQLite local; migração 0030 com 3 índices | `f8ac459` |

Limites que ficam: o leitor de `.apkg` ainda precisa do arquivo inteiro na memória (limitado pelo semáforo); a
fila durável da importação na nuvem (ADR 0007, parte de lote) e o item 6 (rotas caras `vocab`, `profile`,
`gastar`) ficam para a próxima rodada; temporários `.parcial` de upload interrompido por queda do processo não são
limpos no boot.

## 6. Rotas caras baratas — `fix/rotas-caras` (25/09/2026)

Medido com `carga-servidor.mjs --modo=publico` (bundle de produção, 200 usuários pesados de 3.000 cartões em
rodízio, 10 s por nível), antes e depois, na mesma máquina e sem outra carga. CPU por request = CPU média do
processo ÷ req/s.

| Rota (cenário) | Antes: CPU/req · p95 10 / 50 con. | Depois: CPU/req · p95 10 / 50 con. | Ganho de CPU |
|---|---|---|---|
| `GET /api/vocab` revalidando (`vocab-revalida`, If-None-Match) | 168 / 133 ms · 1,9 s / 6,6 s | **1,4 ms** · 20 ms / 79 ms | ~100× |
| `GET /api/vocab` repetido sem ETag (`vocab-quente`, 10 usuários) | 128 / 170 ms · 1,4 s / 8,2 s | **6,2 / 6,5 ms** · 61 / 229 ms | ~20× |
| `GET /api/vocab` frio (primeira leitura depois de uma escrita) | 137 / 143 ms · 2,0 s / 7,2 s | 74 / 76 ms · 0,9 s / 4,2 s | ~1,9× |
| `GET /api/metrics/profile` (`profile-quente`) | 94 / 141 ms · 1,0 s / 6,3 s | **2,1 / 1,9 ms** · 25 / 110 ms | ~50× |
| `GET /api/metrics/profile` (200 em rodízio) | 128 / 126 ms · 1,4 s / 6,6 s | 4,7 / 1,6 ms · 228 / 102 ms | ~27× |
| `POST /api/metrics/seeds/gastar` | 175 / 149 ms · 1,8 s / 7,7 s | **2,8 / 2,9 ms** · 35 / 164 ms | ~55× |
| `PUT /api/settings` (6 itens do catálogo) | 460 / 495 ms · 6,1 s / 9,2 s | **3,3–9,6 / 3,9–4,4 ms** · 42–487 / 203–234 ms | ~50× |

Consultas por request (teste `rotas-caras-equivalencia`): `GET /api/vocab` 304 = **1** (era 3 + o baralho
inteiro); perfil repetido ≤ **4** (era 11); `gastar` ≤ 9 (era 25); `PUT /api/settings` ≤ 12 (era 88).

**O que foi feito, por medição:**
1. `versoes_de_dados` (migração 0032): dois contadores por usuário mantidos por GATILHO (`vocab`:
   `vocab_cards`+`vocab_occurrences`; `atividade`: as cinco tabelas de `computeProfile`). Gatilho e não contador
   na aplicação: escritas em SQL cru, manutenção de boot e outros processos também sobem o número.
2. `GET /api/vocab`: ETag fraco = época do processo + hash do usuário + versão → 304 com uma consulta de chave
   primária; corpo serializado em cache por versão (LRU, 64 MB).
3. `computeProfile`: o resumo das cinco tabelas (sem a parte que depende do relógio) fica em cache por versão
   de `atividade` (LRU, 512 usuários/48 MB); razão de moedas e presença são lidos sempre (4 consultas). As
   quatro leituras de `seed_spends` viraram uma (`seedSpendsRepo.razao`).
4. `gastar` devolve `seedsGastas` pelo `SUM` do razão, sem o segundo `computeProfile`; `PUT /api/settings`
   carrega o contexto de posse uma vez por pedido.
5. Caminho frio: `lerCompacto` — o SQLite serializa as linhas em uma célula JSON (reais com `printf('%!.17g')`,
   exatos em ±[1e-12, 1e15], conferido em 2 M doubles; fora da faixa cai no driver). Leitura do baralho ~2×,
   do perfil ~1,5×. O piso restante é gerar 2,3 MB de JSON.
6. Cliente: `fetchDeck`/`fetchSettings` compartilham a leitura em voo (não pegam carona numa leitura iniciada
   antes de uma escrita) e `fetchDeck` revalida com `If-None-Match`.

**Não atinge 5× no caminho frio** do baralho e do perfil (primeira leitura depois de uma escrita): ~1,5–2×. O
ganho de 5× ou mais vale para toda leitura repetida, que é o padrão do cliente (16 módulos chamam `fetchDeck`).
