# Prontidão para produção — Fase 4: performance e testes de carga (25/09/2026)

Branch `feat/suite-de-carga` (a partir de `auditoria/prontidao-producao`). Tudo abaixo foi medido com os
scripts versionados desta fase; os JSON brutos ficaram no scratchpad da sessão e são reproduzíveis com os
comandos de cada seção.

## 0. Resumo

- **Suíte de carga versionada** (`scripts/perf/suite/`): usuários virtuais (VUs) com ritmo de gente, 7 fluxos
  ponderados, provedor de IA FALSO local, JWT ES256 verificado de verdade, IP próprio por VU ou o mesmo IP
  para todos (cenário escola). Limiares num arquivo só: `scripts/perf/suite/slo.json` ↔ `docs/slo.md`.
- **Depois das correções da Fase 2**, numa máquina local (1 processo = 1 núcleo): **dentro do SLO até 1.000
  VUs** (p95 de leitura 21 ms, gravação 22 ms, IA 17 ms sobre o provedor, **0 erro**, CPU 39 % de um núcleo,
  RSS 426 MB). **Ponto de quebra: 2.000 VUs** (p95 de leitura 334 ms > 300 ms, CPU 72 %); com 3.000 VUs a CPU
  satura (98 %) e surgem conexões recusadas (6,2 % de erro).
- **Antes das correções** (bundle de `5c89100`, a mesma suíte): **quebra com 10 VUs** (3,6 % de erro: STT e MT
  viram 502 quando o provedor limita); com 100 VUs 45 % de erro; com 1.000 VUs a CPU satura (112 %), p95 de
  leitura 646 ms, RSS 1.640 MB e o STT faz **10.671 pedidos** ao provedor para servir 99.
- **No Fly `shared-cpu-1x` (6,25 % de um núcleo sustentado)** a conta muda de ordem de grandeza: **~90 VUs
  simultâneos dentro do SLO, ~140 no limite da cota** (≈ 900–1.400 cadastrados com 10 % simultâneos). Um
  `performance-1x` leva a ~1.500 VUs. **10.000 VUs simultâneos** exigem ~3,8 núcleos de CPU, ~370 escritas/s e
  ~2,5 GB de RSS: Postgres + várias réplicas (ADR 0006) — não cabe em uma máquina com SQLite.
- **Achado corrigido nesta fase (P1):** o MT respondia **502** quando o provedor limitava (429) — erro no SLO e
  nos alertas —, enquanto o STT no mesmo caso já respondia 429 `nuvem_ocupada`. Agora os dois degradam igual.
- **Frontend:** JS inicial **195,2 KB gzip** (163,5 KB brotli), CSS 49,5 KB; LCP sem throttling 376–792 ms;
  Lighthouse desktop 89–97, **mobile 55–74** (LCP simulado 4,3–9,1 s — o `/jogar` é o pior; depois das
  melhorias o `/jogar` mobile foi de 55 para 66 e o TBT de 688 para 294 ms). Aplicados:
  pré-compressão brotli/gzip no build servida pelo próprio servidor, `/jogar` sem o chunk do Anki na carga,
  `Analysis.tsx` com `lazyComRecarga`, `navigator.storage.persist()` para os modelos, protótipo e
  `lucide.min.js` fora do `dist`, **orçamento do bundle no CI** (teto 215 KB gzip = medido + 10 %).

## 1. Ambiente e método

| Item | Valor |
|---|---|
| Máquina | AMD Ryzen 5 5600 (6 núcleos / 12 threads), Windows 11, Node 24.18.0 |
| Servidor | `dist-server/server.cjs` (o `npm run build` de produção), `NODE_ENV=production`, `AUTH_REQUIRED=1`, JWKS ES256 local, `TRUST_PROXY=1` |
| Banco | `preparar.mjs`: migrations reais + `semear.mjs` com 50 usuários pesados (3.000 cartões) e 2.000 médios (150 cartões, 2 sessões × 40 falas, 100 revisões, 100 exercícios) — 2.051 usuários, 453.000 cartões, 260.500 falas, **621 MB**; assinatura ativa (pro/essencial alternados) e crédito de Seeds para todos. Copiado de novo a cada nível |
| IA | provedor FALSO (`provedor-falso.mjs`): STT segura 400 ms, MT 700 ms, **429 acima de 20 RPM por rota** (janela deslizante). `GROQ_BASE_URL` aponta para ele; a guarda anti-SSRF continua ligada (o DNS falso pré-carregado só no servidor sob teste resolve `provedor-falso.test`) |
| Janela | rampa de 15 s (VUs entram escalonados) + **60 s medidos**; o que chega na rampa é descartado |
| Carga da máquina | registrada em cada nível (CPU da máquina inteira e "outros núcleos" = o que não é servidor nem gerador). Outro agente rodava testes em paralelo: a primeira rodada (r1) teve 5,6–7,4 núcleos de outros processos e foi **repetida**; as tabelas abaixo são das rodadas r2/r3 com 0,3–1,8 núcleo de outros |
| Correção do Fly | `shared-cpu-1x` = **6,25 %** de um núcleo sustentado; núcleo do Fly tratado como igual ao local (×1, otimista, como na Fase 2) |

**Os VUs** (`cenarios.mjs`): 70 % "estudo" escolhem um fluxo — navegação 40 (settings + profile + vocab com
`If-None-Match`, ou sessions, ou só vocab), revisão FSRS 25, rodada 15 (`GET /api/vocab/para-jogo` → joga 5–15 s →
`POST /api/exercises/rodada` com os cartões recebidos), loja 5 (`seeds/gastar`), salvar sessão 15 (20 falas) — e
pensam de 2 a 40 s (exponencial, média 12 s). 30 % "captura" mandam uma fala ao STT (WAV PCM 16 kHz de 4 s) e
uma ao MT a cada 4–8 s, **pausam cada serviço pelo `Retry-After`** quando recebem 429/503 (como o cliente) e,
com 5 % de chance por ciclo, encerram a captura (salvam a sessão com 30 falas e sobem ~200 KB de áudio). Cada VU
tem o próprio usuário e token; o VU `i` usa `u-p-*` quando `i % 20 == 0`, senão `u-m-*`.

**Erro** = 5xx, erro de socket, timeout ou 4xx inesperado. **Degradação** (não é erro) = 429 `nuvem_ocupada`,
503 `provedor_em_disjuntor`, 429 `upload_ocupado`. **IA sobre o provedor** = latência medida − tempo que o
provedor segurou (vem no texto da resposta); a recusa da admissão conta inteira.

## 2. Resultados — depois das correções (bundle desta branch)

```bash
npm run build
node scripts/perf/suite/rodar.mjs --vus=0,10,100,1000,2000,4000 --duracao=60 --rampa=15 --sem-veredito   # r2
node scripts/perf/suite/rodar.mjs --vus=10,100,1000,2000,3000 --duracao=60 --rampa=15 --sem-veredito     # r3 (com a correção do MT)
node scripts/perf/suite/rodar.mjs --mesmo-ip --vus=100,1000 --duracao=60 --rampa=15 --sem-veredito       # escola
```

### 2.1 Por nível (r3; `0 VU` e `4.000` da r2)

| VUs | req/s | erro % | degr. % | leitura p50/p95/p99 ms | gravação p50/p95/p99 ms | upload p95 | IA sobre provedor p95 | CPU do servidor (% de 1 núcleo) | CPU-ms/req | RSS máx MB | loop máx ms | máquina % (outros núcleos) | veredito |
|---:|---:|---:|---:|---|---|---:|---:|---:|---:|---:|---:|---|---|
| 0 | 0 | — | — | — | — | — | — | **0,8** | — | 135 | 4,5 | 18,4 (2,2) | repouso |
| 10 | 1,8 | 0 | 4,6 | 2,9/34/67 | 4,6/6,3/8,3 | 5,1 | 18,9 | 1,9 | 10,6 | 173 | 63 | 3,3 (0,38) | dentro |
| 100 | 13,6 | 0 | 30,1 | 3,3/5,7/31 | 4,2/8,3/18,6 | 7,7 | 16,4 | 5,6 | 4,1 | 316 | 51 | 2,7 (0,26) | dentro |
| **1.000** | **122,4** | **0** | 27,5 | 3,9/**21**/53 | 4,9/**22**/43 | 49,5 | **17,4** | **39,3** | 3,21 | **426** | 66 | 6,5 (0,31) | **dentro** |
| **2.000** | 227,8 | 0 | 22,2 | 10,5/**334**/704 | 12,1/273/907 | 259 | **337** | **72,4** | 3,18 | 669 | 230 | 10 (0,33) | **QUEBROU**: leitura p95 > 300; IA > 100 |
| 3.000 | 315,6 | 6,16 | 19,8 | 275/1.517/1.785 | 286/1.636/1.837 | 2.553 | 1.666 | 97,7 | 3,10 | 630 | 364 | 13 (0,37) | quebrou em tudo; `ECONNREFUSED` |
| 4.000 (r2) | 414,2 | 27,3 | 14,3 | 459/1.870/2.024 | 1.582/1.952/2.140 | 2.902 | 1.907 | 100,2 | 2,42 | 704 | 402 | 15 (0,57) | saturado |

- **Ponto de quebra: 2.000 VUs** (≈ 228 req/s, CPU a 72 % de um núcleo). Entre 1.000 e 2.000 a CPU passa de
  39 % para 72 % e o p95 salta de 21 ms para 334 ms: é o joelho da fila de um event loop único, não o banco
  (escritas a 74/s, bem abaixo das 654–1.275/s medidas na Fase 2). Acima de ~100 % os sockets novos recebem
  `ECONNREFUSED` (fila de `accept` cheia no Windows).
- **CPU-ms por requisição cai com a carga** (10,6 → 3,2 ms): o repouso (0,8 %) e os timers se diluem. A 1.000
  VUs: **0,038 % de um núcleo por VU** (39,3 − 0,8 = 38,5 % / 1.000).
- **Memória:** 426 MB com 1.000 VUs, 669 MB com 2.000 (≈ 0,24 MB por VU acima de 1.000; teto da VM 1 GB).
- **Gerador fora da conta:** CPU do gerador 0,2–21,8 % de um núcleo, atraso máximo do loop dele 21–23 ms em
  todos os níveis — ele não foi o gargalo.
- **Degradação da IA é o desenho, não falha:** com 20 RPM no provedor, 1.000 VUs (285 capturando) pedem ~16
  STT/s e ~15 MT/s; 19–20 por minuto são servidos e o resto recebe 429 `nuvem_ocupada` em **p95 17 ms**. O
  provedor falso viu 164 STT/165 MT com 200 e só 15/43 com 429 na rodada inteira — a admissão segura a conta
  **antes** de gastar o limite do provedor.
- **Repetição de keep-alive:** 8 (1.000 VUs) a 149 (3.000) requisições bateram num socket que o servidor fechara
  por ociosidade (o Node fecha em 5 s) e foram repetidas uma vez, como o navegador faz. Ver §6, item 4.

### 2.2 Por etapa, 1.000 VUs (r2, antes da correção do MT) — req/s · p50 · p95 ms

| Etapa | req/s | p50 | p95 | status |
|---|---:|---:|---:|---|
| `GET /api/vocab` (If-None-Match) | 16,1 | 4,5 | 32 | 560× 200, 407× 304 |
| `GET /api/settings` | 10,6 | 2,8 | 26,7 | 200 |
| `GET /api/metrics/profile` | 10,6 | 4,6 | 28,1 | 200 |
| `GET /api/sessions` | 5,6 | 2,9 | 18,8 | 200 |
| `GET /api/vocab/para-jogo` | 8,2 | 4,8 | 25,4 | 200 |
| `POST /api/vocab/:id/review` | 13,0 | 4,6 | 25,0 | 200 |
| `POST /api/exercises/rodada` | 8,3 | 4,8 | 35,5 | 200 |
| `POST /api/metrics/seeds/gastar` | 2,6 | 6,5 | 36,2 | 200 |
| `POST /api/sessions` | 10,7 | 5,8 | 29,0 | 200 |
| `POST /api/sessions/:id/audio` (200 KB) | 2,5 | 9,3 | 44,7 | 200 |
| `POST /api/ai/stt` | 16,1 | 418 | 427 | 19× 200, 948× 429 nuvem_ocupada |
| `POST /api/ai/mt` | 15,5 | 718 | 725 | 20× 200, 905× 429, **4× 502** (corrigido, §5) |

### 2.3 Cenário escola (todos os VUs do mesmo IP, 203.0.113.50)

| VUs | req/s | erro % | leitura p95 | gravação p95 | CPU % | veredito |
|---:|---:|---:|---:|---:|---:|---|
| 100 (r2) | 10,7 | 0,16 (1 MT 502) | 7,1 | 7,4 | 4,6 | dentro |
| 1.000 (r3) | 102,3 | **0** | 19,9 | 22,5 | 36,4 | dentro |

**Nenhum 429 do limitador de IP** com 1.000 usuários autenticados atrás do mesmo IP (a correção 1 da Fase 2 §7
segura). Observação honesta: o bundle **antigo** também não bloqueou a escola com ritmo realista (100 VUs,
0 respostas 429 do limitador) — o defeito da Fase 2 §2.5 exige mais de 30 requisições **em voo** ao mesmo tempo,
o que ritmo de gente com p95 de 15 ms não produz; ele aparece em rajada (a sala abrindo o app no mesmo segundo),
que é o que o teste de regressão de 200 simultâneas cobre.

## 3. Antes × depois (a mesma suíte contra o bundle de `5c89100`, antes das correções da Fase 2)

```bash
git archive 5c89100 | tar -x -C <tmp>/antes && cd <tmp>/antes && \
  npx esbuild server.ts --bundle --platform=node --format=cjs --packages=external --outfile=<fx-carga>/dist-server/server-antes-5c89100.cjs
node scripts/perf/suite/rodar.mjs --bundle=dist-server/server-antes-5c89100.cjs --porta=3170 --vus=10,100,1000 --duracao=60 --rampa=15 --sem-veredito
```

| VUs | | req/s | erro % | leitura p95 | gravação p95 | IA sobre provedor p95 | CPU % | CPU-ms/req | RSS MB | loop máx ms |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 10 | antes | 1,8 | **3,64** | 94 | 11 | 20 | 2,6 | 14,4 | 231 | 97 |
| 10 | depois | 1,8 | **0** | 34 | 6,3 | 19 | 1,9 | 10,6 | 173 | 63 |
| 100 | antes | 17,4 | **45,2** | 12,8 | 14,9 | **2.069** | 15,6 | 9,0 | 417 | 128 |
| 100 | depois | 13,6 | **0** | 5,7 | 8,3 | 16 | 5,6 | 4,1 | 316 | 51 |
| 1.000 | antes | 182,5 | **51,9** | **646** | **687** | **3.521** | **112** | 6,1 | **1.640** | **611** |
| 1.000 | depois | 122,4 | **0** | 21 | 22 | 17 | 39 | 3,2 | 426 | 66 |

- **IA antes:** sem admissão e com 3 tentativas por 429, 1.000 VUs mandaram **10.671 pedidos de STT** ao
  provedor para 99 atendidos; o cliente recebia **502** (2.824 STT + 2.854 MT em 60 s) depois de 0,9–4,3 s. Isso
  sozinho já quebra o SLO de erro com **10 VUs**. Depois: 429 `nuvem_ocupada` em ~17 ms e o cliente pausa.
- **CPU:** a 100 VUs, 15,6 % → 5,6 % de um núcleo (**2,8×**); a 1.000 VUs, saturado (112 %) → 39 %. O ganho vem
  das rotas caras baratas (§6 da Fase 2: `vocab` 304 com 1 consulta, `profile` em cache por versão) e de não
  reprocessar a tempestade de retentativas da IA. O req/s "antes" é maior porque os VUs de captura recebiam
  502 e tentavam de novo no ciclo seguinte (o 502 não pausa a nuvem).
- **Memória a 1.000 VUs:** 1.640 MB → 426 MB (o processo antigo ultrapassaria a VM de 1 GB).

## 4. Frontend

```bash
npm run build
node scripts/perf/orcamento-bundle.mjs                     # tamanhos e orçamento (CI)
node scripts/perf/frontend.mjs --execucoes=3 --saida=<pasta>   # Lighthouse 13 + CWV no Playwright
node scripts/perf/resumir-lighthouse.mjs <pasta> --md
```

### 4.1 Bundle

| | bruto | gzip 6 | brotli 11 |
|---|---:|---:|---:|
| **JS inicial** (`index-*.js` + `vendor-react-*.js`, o que o `index.html` manda baixar) | 588,9 KB | **195,2 KB** | 163,5 KB |
| CSS inicial | 280,2 KB | 49,5 KB | 40,6 KB |

Por rota (Playwright, sem throttling, JS transferido na carga — brotli): `/` 187 KB (15 arquivos), `/planos`
215 KB (32), `/jogar` 335 KB (50), `/capturar` 368 KB (45). Maiores chunks sob demanda (gzip): workers do Whisper
(157 KB), MT (156 KB) e speaker-id (145 KB) — só na captura local; `SeletorDeCapa` 118 KB; `Play` 92 KB;
`CategoricalChart` (recharts) 92 KB; `LiveCapture` 50 KB.

**Lazy loading:** todas as 20 telas do `App.tsx` já passam por `lazyComRecarga`; faltava o `PlayLobby` de
`Analysis.tsx` (usava `lazy` cru — a aba "Jogos" de uma sessão aberta antes de um deploy dava tela preta) e o
`BaralhoAnki`, importado estaticamente pelo `Play` embora só apareça ao abrir "Trazer baralho" (o Lighthouse
mobile listava 27 KB dele como JS não usado no `/jogar`). **Os dois corrigidos.**

**Orçamento:** `slo.json → frontend`: JS inicial ≤ **215 KB** gzip, CSS ≤ **55 KB** (medido + 10 %), nenhum
`prototipo-*.html`/`lucide.min.js` no `dist`. `orcamento-bundle.mjs` roda no job `carga` do CI.

### 4.2 Lighthouse 13 (mediana de 3, servidor de produção local, dados do `local-owner` com 3.000 cartões)

| preset | rota | perf | a11y | boas práticas | FCP ms | LCP ms | TBT ms | CLS |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| desktop | / | 97 | 100 | 100 | 619 | 1.217 | 27 | 0,032 |
| desktop | /capturar | 96 | 100 | 100 | 575 | 1.383 | 10 | 0 |
| desktop | /jogar | 89 | 100 | 100 | 579 | 1.886 | 0 | 0,099 |
| desktop | /planos | 97 | 100 | 100 | 582 | 1.266 | 3 | 0 |
| mobile | / | 70 | 100 | 100 | 2.408 | 4.313 | 475 | 0,017 |
| mobile | /capturar | 68 | 100 | 100 | 2.407 | 6.022 | 302 | 0,001 |
| mobile | /jogar | **55** | 100 | 100 | 2.408 | **9.053** | 688 | 0 |
| mobile | /planos | 74 | 100 | 100 | 2.407 | 4.692 | 299 | 0 |

(Antes das melhorias desta fase. O mobile do Lighthouse simula um Moto G com CPU 4× mais lenta e 4G lento: o
FCP de 2,4 s é o custo de baixar e executar ~195 KB gzip de JS inicial nessa rede; o LCP do `/jogar` é a cadeia
`index → Play → minigames` e o `bootup-time` de 1,1 s de script.) Resultado depois das melhorias: §4.4.

### 4.3 Core Web Vitals no Playwright (Chromium, sem throttling, mediana de 3)

| perfil | rota | LCP ms | CLS | FCP ms | TTFB ms | JS transferido KB |
|---|---|---:|---:|---:|---:|---:|
| mobile (Pixel 7) | / | 376 | 0 | 228 | 2 | 187 |
| mobile | /capturar | 396 | 0 | 244 | 3 | 368 |
| mobile | /jogar | 776 | 0 | 232 | 3 | 335 |
| mobile | /planos | 392 | 0 | 236 | 2 | 215 |
| desktop 1366 | / | 376 | 0,004 | 232 | 2 | 187 |
| desktop | /jogar | 792 | 0,001 | 240 | 3 | 335 |

Todos dentro de "bom" (LCP < 2,5 s, CLS < 0,1) **em rede e CPU locais**; o número de campo vai ser o do
Lighthouse mobile, pior. INP: ver o fim de §4.4.

### 4.4 Melhorias aplicadas e efeito

| Melhoria | Efeito medido |
|---|---|
| **Pré-compressão no build** (`scripts/vite/precomprimir.ts`: `.br` brotli 11 — 9 acima de 4 MB — e `.gz` nível 9) servida por `servirPreComprimido` (`server/http/estaticos.ts`) com `Content-Encoding`, `Vary` e o `Cache-Control` do original | o `compression` gastava **10,0 ms de CPU por primeira visita** (brotli 4 do JS+CSS inicial; gzip 6 seria 14,9 ms) e **210 ms por download do wasm** de 22,5 MB — no Fly, 10 ms são 16 % de um segundo de CPU sustentada. Agora 0. Bytes: JS+CSS inicial **243,4 → 204,0 KB** (brotli 4 → 11, −16 %); wasm **4,51 → 3,84 MB**. Custo: +17 s de build e +17 MB no `dist` (35 → 52 MB) |
| Protótipo de design e `lucide.min.js` fora do `dist` | na branch estavam só como não versionados na worktree de auditoria; o plugin os remove do `dist` se existirem em `public/`, e o orçamento reprova se voltarem. O arquivo continua na pasta |
| `BaralhoAnki` sob demanda no `Play` | `/jogar`: −33 KB de JS transferido, TBT mobile 688 → 294 ms, perf mobile 55 → 66 (rodada 2 abaixo) |
| `PlayLobby` com `lazyComRecarga` em `Analysis.tsx` | correção de robustez (deploy), sem efeito de tamanho |
| `navigator.storage.persist()` depois de um modelo baixado (`modelManifest.ts`) | o Cache Storage deixa de ser despejável em silêncio (Whisper > 100 MB). Pede uma vez por carga, só na janela, só depois de um download que a pessoa iniciou (no Firefox aparece um pedido) |

**Rodada 2** (depois de todas as melhorias, mesmo comando, mesma máquina, carga da máquina 6 %):

| preset | rota | perf antes → depois | LCP ms antes → depois | TBT ms antes → depois | JS transferido na carga (Playwright) |
|---|---|---|---|---|---|
| mobile | /jogar | **55 → 66** | 9.053 → 8.909 | **688 → 294** | **335 → 302 KB** (50 → 48 arquivos; decodificado 1.106 → 990 KB) |
| mobile | / | 70 → 71 | 4.313 → 4.260 | 475 → 462 | 187 → 188 KB |
| mobile | /capturar | 68 → 68 | 6.022 → 6.026 | 302 → 333 | 368 → 369 KB |
| mobile | /planos | 74 → 73 | 4.692 → 4.691 | 299 → 310 | 215 → 215 KB |
| desktop | /jogar | 89 → 89 | 1.886 → 1.870 | 0 → 33 | — |

LCP no Playwright (sem throttling), `/jogar`: 776 → 708 ms (mobile), 792 → 616 ms (desktop). As outras rotas
ficaram iguais dentro do ruído (±5 no perf), como esperado: a pré-compressão não muda bytes no Lighthouse local
(o `compression` já mandava brotli 4) — o ganho dela é CPU do servidor e −16 % de bytes, que o Lighthouse
simulado não reflete porque a medida é local.

**INP não foi medido:** o clique automático no primeiro botão visível não gerou entrada de `event` ≥ 16 ms
em 0 de 24 cargas (o PerformanceObserver ficou em 0). O número útil de INP vem de campo (RUM) — §8, item 6.

## 5. Achado corrigido: MT respondia 502 quando o provedor limitava (P1)

`percorrerCascata` fechava o balde da admissão no 429 do provedor, mas o `mtProxy` respondia **502
`provedor_indisponivel`** ao cliente. O STT no mesmo caso já respondia 429 `nuvem_ocupada`. Com o provedor falso
a 20 RPM: 1–4 respostas 502 por minuto em qualquer nível (o bastante para reprovar o SLO de erro com 10 VUs:
0,92 %). Correção: `ResultadoDaCascata.limitadoPeloProvedor` quando **todas** as pernas chamadas deram 429, e o
`mtProxy` responde 429 `nuvem_ocupada` com o `Retry-After` fixado pela admissão; 429 numa perna e 5xx na outra
continua 502. Testes em `tests/integration/mt-cascata-reserva.test.ts` (vermelho antes, verde depois). Na r3,
**0 respostas 502** em todos os níveis até 2.000 VUs.

## 6. Capacidade — o que muda na tabela da Fase 2

### 6.1 Da máquina local para o Fly

CPU por VU na mistura realista, 1.000 VUs: **0,038 % de um núcleo** (+ 0,8 % de repouso). O joelho do p95 fica
em ~70 % de utilização do núcleo (entre 39 % dentro do SLO e 72 % fora).

| Máquina | CPU sustentada | VUs no limite da cota | VUs dentro do SLO (70 % da cota) | Cadastrados (10 % simultâneos) |
|---|---:|---:|---:|---:|
| `shared-cpu-1x` (hoje) | 6,25 % | (6,25 − 0,8) / 0,038 ≈ **143** | (4,4 − 0,8) / 0,038 ≈ **94** | ~900–1.400 |
| `performance-1x` | 100 % | ~2.600 (saturação medida: 2.000–3.000) | ~1.800 (medido: quebra em 2.000) | ~15.000–18.000 de CPU; **o banco quebra antes** (6.2) |

Com rajada, o `shared-cpu-1x` aguenta mais por até ~500 s (saldo), depois é estrangulado e o p95 sobe como a
linha de 2.000 VUs acima.

### 6.2 Tabela revista (hipótese da Fase 2: 10 % simultâneos; mistura desta suíte)

| Cadastrados | Simultâneos | req/s (medido: 0,122 × VU) | CPU (núcleos) | Escritas/s (0,037 × VU) | RSS | STT/min pedido | O que quebra primeiro | Fase 2 dizia |
|---|---:|---:|---:|---:|---:|---:|---|---|
| **100** | 10 | 1,8 | 0,019 (30 % da base) | 0,5 | 173 MB | ~30 | **Groq por minuto** (20 RPM) — degrada para o local, sem erro | 44 % da base; 4 uploads derrubavam; escola bloqueada |
| **1.000** | 100 | 13,6 | 0,056 (**90 % da base**) | 3,8 | 316 MB | ~300 | **CPU do `shared-cpu-1x` no pico** (sem folga para rajada longa) e Groq | **4,4× a base** |
| **10.000** | 1.000 | 122 | **0,39** (6,3× a base; 39 % de um `performance-1x`) | 37 | 426 MB | ~3.000 | CPU do shared → `performance-1x` resolve; Groq pago obrigatório; banco ~3,9 GB | 2,7 núcleos |
| **100.000** | 10.000 | ~1.220 (extrapolado) | **~3,8** | **~370** | ~2,5 GB | ~30.000 | um event loop por processo, escritor único, volume | — |

### 6.3 10.000 VUs simultâneos — extrapolação

Da curva medida (CPU-ms por requisição estável em 3,1–3,2 ms entre 1.000 e 3.000 VUs; req/s linear em
0,114–0,122 por VU):

- **req/s** ≈ 10.000 × 0,122 = **~1.220 req/s**; **CPU** ≈ 1.220 × 3,2 ms = **3,9 núcleos** ocupados, **~5,6
  núcleos** para ficar no joelho de 70 %. Um processo Node usa um núcleo: são **≥ 6 processos**. No
  `shared-cpu-1x` seriam 62× a cota de uma máquina.
- **Escritas:** 37,1/s a 1.000 VUs, 74,4/s a 2.000 (linear) → **~370/s** a 10.000. A Fase 2 mediu o SQLite com
  revisão FSRS em 62–169/s e o teto no Fly sustentado em ~80–160 escritas/s: **acima do escritor único**.
- **Memória:** 0,24 MB por VU acima de 1.000 → ~2,6 GB num processo; dividido em 6 processos, ~0,6 GB cada.
- **IA:** 3.000 capturando pedem ~30.000 STT/min contra 20 RPM da camada grátis — 99,9 % degradado para o motor
  local. Precisa do tier pago da Groq e dos limites `IA_ADMISSAO_*` junto, e de estado compartilhado da admissão
  entre processos (hoje é por processo, ADR 0007).
- **Conclusão:** 10.000 simultâneos (~100.000 cadastrados) = **passo 4 da escada** (`docs/escala.md`): Postgres,
  várias réplicas atrás do proxy do Fly, limitador/admissão/cache em estado compartilhado. Não há ajuste de
  uma máquina que chegue lá.

## 7. SLOs e CI

- `docs/slo.md` + `scripts/perf/suite/slo.json`: leitura p95 < 300 ms, gravação < 800 ms, upload < 2 s, IA
  < 100 ms sobre o provedor, erro < 0,5 % (quebra > 1 %); orçamento do bundle. Derivados das medições (§2: com
  1.000 VUs a folga é 14× na leitura e 36× na gravação) e do que o usuário percebe (tabela no documento).
- `scripts/perf/ci-carga.mjs` lê conexões, duração, rotas e o p95 (classe `leitura`) do `slo.json`.
- Job `carga` do `ci.yml`: orçamento do bundle → autocannon nas rotas baratas → **suíte com 10 VUs × 30 s**
  (banco pequeno, ~50 s) com artefato `suite-carga.json`. Workflow manual `lighthouse.yml` (Lighthouse + CWV,
  artefato). `npm run workflows:validar`: 8 arquivos OK.

## 8. Recomendações (não aplicadas)

1. **Sair do `shared-cpu-1x` antes de ~100 simultâneos no pico** (≈ 1.000 cadastrados): a medição mostra 90 % da
   cota sustentada com 100 VUs. O gatilho "~150 cadastrados ativos" da escada (`docs/escala.md`, passo 1)
   estava conservador; o de CPU estrangulada continua valendo.
2. **JS inicial:** 195 KB gzip → o Lighthouse mobile dá FCP de 2,4 s em todas as rotas. `index-*.js` tem 136 KB
   gzip e 45 KB dele não são usados na `/` (Lighthouse `unused-javascript`); separar o que só as telas usam é o
   próximo passo (medir com um visualizador de bundle antes).
3. **`/jogar` mobile** (LCP 9 s simulado): cadeia de chunks e 1,1 s de script no arranque; pré-carregar o chunk
   da rota a partir do `index.html` (modulepreload por rota) ou renderizar o esqueleto do lobby antes de
   carregar os nove jogos.
4. **`keepAliveTimeout` do servidor** (padrão do Node, 5 s): atrás do proxy do Fly, um socket fechado pelo
   servidor no instante em que o proxy o reusa vira erro de conexão; a suíte viu 8–149 repetições por minuto.
   Definir `server.keepAliveTimeout` acima do timeout ocioso do proxy (e `headersTimeout` acima dele) junto com
   os timeouts HTTP pendentes da Fase 2 §4.2 — conferir o valor do proxy do Fly antes.
5. **`hard_limit = 250` do Fly** (`fly.toml`) por requisições em voo: na mistura medida, 1.000 VUs têm poucas
   requisições em voo (p95 22 ms) — o limite não morde antes da CPU.
6. **INP** não foi medido (§4.4): com `web-vitals` como dependência de desenvolvimento (ou RUM em
   produção), medir INP de campo; o Lighthouse não mede INP em navegação.

## 9. Arquivos

- `scripts/perf/suite/`: `rodar.mjs`, `cenarios.mjs`, `preparar.mjs`, `provedor-falso.mjs`, `dns-falso.cjs`,
  `slo.mjs`, `slo.json`
- `scripts/perf/orcamento-bundle.mjs`, `scripts/perf/frontend.mjs`, `scripts/vite/precomprimir.ts`
- `scripts/perf/ci-carga.mjs` (lê o `slo.json`), `scripts/perf/escala/semear.mjs` (`--medios`)
- `server/http/estaticos.ts` (`servirPreComprimido`, `codificacoesAceitas`), `server/ai/cascata.ts` e
  `server/ai/mtProxy.ts` (429 do provedor no MT), `src/gateway/modelManifest.ts` (`persist()`),
  `src/components/views/Analysis.tsx`, `src/components/views/Play.tsx`, `vite.config.ts`
- `.github/workflows/ci.yml` (job `carga`), `.github/workflows/lighthouse.yml`
- `docs/slo.md`, `docs/escala.md` (seção da Fase 4)
- Testes: `tests/perf-suite.test.ts`, `tests/integration/cache-da-spa.test.ts`,
  `tests/integration/mt-cascata-reserva.test.ts`, `tests/modelManifest.test.ts`
