# Fase 5 — Observabilidade, desempenho e confiabilidade (entregável do Gate 5)

Rodada de saneamento, branch `saneamento/2026-09-08`. Oito changes, cinco commits.

Tudo abaixo é **confirmado por execução**, salvo onde estiver escrito "inferido por leitura".

Toda medição de servidor: `node dist-server/server.cjs`, `NODE_ENV=production`, `AUTH_REQUIRED=0`,
`127.0.0.1`, cópia do banco real, Node v24.18.0 — os mesmos parâmetros da baseline de 2026-09-08.

## 1. Observabilidade

### O id do request existia e quase nunca aparecia

Varrendo `server/**` + `server.ts` e descontando comentários: das **45** chamadas de `log()`, **23
não passavam `requestId`**. Metade exata do diário era evento solto. A distribuição explica por que
isso não se resolve pedindo disciplina — `storageQuota` (4), `usageQuota` (5), `bootStatus` (3),
`entitlements`, `repositories/credentials`: **nenhum deles tem um `Request` em mãos**. Passar o id à
mão exigiria atravessar a assinatura de toda a camada de domínio com um parâmetro de telemetria.

`AsyncLocalStorage` aberto no middleware e lido dentro de `log()`. Nenhum chamador mudou. A
alternativa barata — variável de módulo — funciona num teste e mente sob concorrência; o teste tem o
caso de dois requests em voo, que é onde ela atribuiria a linha ao request errado.

### `/metrics`, e o agregador que foi recusado com evidência

`AggregatorRegistry.clusterMetrics()` percorre `cluster.workers` e **só eles**
(`node_modules/prom-client/lib/cluster.js:70`) — e aqui o primário também atende. Com
`CLUSTER_WORKERS=4` a resposta "agregada" omitiria ~1/4 do tráfego em silêncio. Concatenar os dois
textos produz um scrape **inválido**, não somado: o formato recusa `# HELP` repetido para a mesma
família. Entre um número agregado que mente por omissão e um parcial que se declara parcial, ficou o
segundo.

Cardinalidade: a label é o padrão da rota, e o que não casou rota cai num balde único. Sem isso um
scanner de porta inventaria mil séries em dez minutos, e série no Prometheus custa memória para
sempre.

### Dois portões teriam deixado as rotas novas invisíveis

`rotas-sem-caracterizacao.mjs` e `rotas-sem-consumidor.mjs` liam só `server/routes/*.ts`: rota
registrada direto no app não entrava no censo — `/api/health` só aparecia porque estava empurrada à
mão. É o mesmo defeito dos globs de ast-grep na Fase 3. Corrigido: **85 → 87 rotas**, os dois em
exit 0.

### `/api/ready`

`health` = "estou vivo", e quem lê decide **reiniciar**. `ready` = "consigo atender", e quem lê
decide **tirar do balanceador**. O `HEALTHCHECK` do Docker não reinicia nada — ele marca
`unhealthy`, e quem lê esse estado decide rotear. Apontá-lo para o health estava errado por
acidente: ele devolve 200 numa instância que subiu com o banco na versão anterior.

Provedores de IA ficam fora do ready: um terceiro instável tiraria todas as réplicas ao mesmo tempo.

## 2. Confiabilidade

`grep -rn "SIGTERM\|SIGINT\|process.on(" server server.ts` devolvia **zero**. Um SIGTERM matava o
processo no meio de uma escrita, e o `cluster.on('exit')` refazia qualquer worker — inclusive
durante o desligamento.

| medida | valor |
|---|---:|
| `POST /api/sessions` com 1.500 falas | 130–160 ms |
| `-wal` antes do checkpoint | 659.232 bytes |
| `.db` antes → depois do checkpoint | 11.665.408 → 12.251.136 bytes, `-wal` zerado |
| dreno das conexões em curso | 1–3 ms |

`closeIdleConnections()` **não entrou**: medido, com socket keep-alive aberto o dreno leva 2 ms sem
ela — o Node já derruba a ociosa dentro do `close()` desde a v19, e o projeto exige >= 22. Manual
desmentido por medição.

### O disjuntor, e o que a medição tirou do escopo

Timeout **já existia** e é único (`llmClient.ts:107`, `sttProxy.ts:129`); a cascata **já cobria**
fallback. O que faltava era memória entre requisições: com o primário caído, cada tradução pagava
12 s antes de chegar à reserva. Disjuntor por `base·modelo`, 5 falhas, 30 s, meio-aberto com uma
sondagem. 413 não conta — é o nosso teto de prompt, antes de qualquer socket.

Retry **só no STT**, que não tem cascata, e **não em timeout**: o timeout é o nosso `AbortSignal`, e
a requisição pode estar sendo processada e cobrada naquele momento. Só 429 e 5xx. `opossum` foi
recusado: ela envolve promessa que rejeita, e `chamarChat` devolve `{ok,status,causa}` de propósito.

### O cache que foi removido por medição

O `Map` de `images.ts` dizia "evita re-bater no Openverse a cada hover". Com o fluxo real — o cliente
já tem cache por palavra (`palavraDaAnalise.ts:113`), então chega ao servidor cada palavra distinta
uma vez por sessão:

| teto | acertos |
|---|---:|
| 200 (o que existia) | 20 de 916 = **2,2%** |
| 1.000 | 164 de 916 = 17,9% |
| sem teto | 164 de 916 = 17,9% |

Ele era pequeno demais para o vocabulário de **uma** sessão, pagava heap e servia resultado de idade
ilimitada (não havia validade). Levá-lo ao banco foi recusado: trocaria rede por disco em 100% das
buscas para servir 2%.

## 3. Desempenho — e as duas hipóteses fáceis que a medição derrubou

A baseline apontava duas rotas caras. As explicações óbvias — falta de índice, falta de paginação —
foram conferidas e as duas estão erradas:

- **`EXPLAIN QUERY PLAN` das cinco consultas do perfil e da listagem: todas usam índice.**
- **O banco real é pequeno**: 2.783 cartões vivos, 240 falas, 58 revisões, 198 resultados.

### `GET /api/vocab` — o custo é o corpo, e metade dele é nome de chave

| medida | valor |
|---|---:|
| resposta com `SELECT *` | 2.002,9 KB |
| só os nomes de chave, repetidos 2.783 vezes | 1.084,4 KB (54%) |
| sem as seis colunas internas | 1.636,7 KB |
| **redução no corpo cru** | **18,3%** |
| **redução depois do gzip** | **10,2%** |

A segunda linha da tabela é a que corrige a leitura fácil da primeira: **o gzip já comprimia bem os
nomes repetidos**, então o ganho na rede é metade do ganho no corpo. Foi por isso que a latência
melhorou só ~7% (p50 991 → 925 ms), e não 18%.

`user_id` e `deleted_at` nunca deveriam ter saído — o primeiro devolve o id do dono, que o cliente
já sabe; o segundo só pode ser `null` nessa rota, porque o `WHERE` já filtra.

**A conferência mudou a lista no meio do caminho**, e é o registro mais útil desta seção:
`cloze_prompt`, `cloze_answer`, `cefr_source`, `first_seen_at` e `last_seen_at` *pareciam* mortas —
`rowToVocabCard` não as nomeia — e são lidas pelo espalhamento `...row` em quatro arquivos. Tirar
qualquer uma quebraria a tela **em silêncio**.

### `GET /api/exercises/results` — o achado que só o teste de carga produz

Ela não tinha teto nenhum: devolvia a tabela inteira. Com 198 linhas custava 37 ms e passou pela
baseline sem chamar atenção. Sob o k6, que grava uma rodada por iteração, a tabela chegou a ~20 mil
linhas e a mesma rota passou a devolver **3,85 MB por chamada** — 1,1 GB numa corrida de 2m30.

O detalhe que fecha o diagnóstico: `latencia.mjs` **já mandava `?limite=20`** desde a baseline, e o
`.strip()` do schema o descartava em silêncio.

Medido antes e depois, mesmo comando, cópia limpa nas duas:

| medida | antes | depois |
|---|---:|---:|
| tráfego recebido | 1,1 GB | 46 MB |
| requisições | 5.729 | 16.320 |
| req/s | 37,0 | **108,8** |
| jornadas completas | 337 | 960 |
| p95 global | 2,81 s | 1,11 s |
| p95 do perfil | 3,31 s | 1,60 s |
| p95 da rodada | 2,19 s | 448 ms |
| 5xx | 0 | 0 |

### `GET /api/metrics/profile` — o diagnóstico correto, e por que não foi tocado

Isolado, `computeProfile` custa **41,8 ms** (mediana de 5). Os 371 ms medidos por HTTP com 10
conexões são **fila**: 10 chamadas de ~42 ms de CPU num processo só. O `req/s` medido (26) bate com
`1000/42`. Não é consulta lenta, é CPU por chamada num único thread.

Reduzir os 41,8 ms exige reestruturar a função que alimenta várias telas. Fica registrado com o
número, e não escondido: é o próximo passo do desempenho de servidor.

## 4. Latência, arranque e recuperação — baseline × final

| rota | p50 baseline | p50 final | p95 baseline | p95 final |
|---|---:|---:|---:|---:|
| `GET /api/health` | 2 | 2 | 2 | 3 |
| `GET /api/me` | 4 | 5 | 7 | 9 |
| `GET /api/metrics/profile` | 354 | 371 | 372 | 422 |
| `GET /api/metrics/xp` | 14 | 15 | 15 | 19 |
| `GET /api/exercises/recordes` | 7 | 8 | 8 | 11 |
| `GET /api/vocab/para-jogo` | 40 | 43 | 41 | 72 |
| **`GET /api/vocab`** | **991** | **925** | **1576** | **1476** |
| `GET /api/sessions` | 4 | 5 | 6 | 7 |
| `GET /api/exercises/results` | 37 | 40 | 39 | 70 |
| `GET /api/rank/termo` | 2 | 2 | 3 | 3 |
| `POST /api/exercises/rodada` | 27 | 29 | 38 | 50 |
| `POST /api/vocab/:id/review` | 14 | 14 | 20 | 33 |

Leitura honesta: **fora de `/api/vocab`, tudo está dentro do ruído da máquina** (±1 a 3 ms, com o
p95 mais instável que o p50). Este medidor exercita uma rota por vez com 10 conexões; o ganho real
desta fase não aparece nele, aparece no k6 (§3), que é o cenário em que as rotas competem.

| medida | baseline | final |
|---|---:|---:|
| arranque (mediana de 5) | 1.334 ms | 1.742 ms |
| health 200 após `kill -9` | 1.405 ms | 1.649 ms |
| 2xx sem linha no banco (perda) | 0 | 0 |
| `integrity_check` | ok | ok |

O arranque piorou ~400 ms. Causa provável, **inferida por leitura e não medida**: o `prom-client` e
os módulos novos entram no bundle e são carregados no boot mesmo com `METRICS_ENABLED` desligado.
Fica registrado; um `import()` tardio resolveria, e não foi feito nesta fase.

## 5. Concorrência de gasto, pela pilha HTTP inteira

12 ondas de 40 gastos simultâneos, cópia do banco real:

| medida | valor |
|---|---:|
| tentativas | 480 |
| aceitas (200) | 52 |
| recusadas (402 `saldo_insuficiente`) | 428 |
| linhas gravadas em `seed_spends` | 52 |
| `seedsGastas` antes → depois | 3.085 → 5.165 |
| delta | 2.080 = 52 × 40, exato |
| 5xx | 0 |

## 6. Quatro erros meus nesta fase, e o que cada um ensinou

1. **O teste de concorrência passou por vacuidade.** Apontei-o para um caminho de banco
   inexistente, o SQLite criou um vazio, as 40 requisições voltaram 400 e a saída disse "APROVADO:
   teto respeitado". Zero gasto aceito não prova teto nenhum. Agora reprova — o mesmo remédio que a
   Fase 4 usou no IDOR (a chamada de controle do usuário A).
2. **A primeira corrida do k6 mediu 400 de validação.** O roteiro omitia `roundId` e
   `exerciseKind`, e o resultado — "58,82% de falha" — teria sido lido como saturação do servidor.
3. **Os limiares do k6 reprovavam sempre.** Vinham da medição de rota isolada com 10 conexões.
   Limiar que reprova sempre é tão inútil quanto o que aprova sempre; viraram catraca sobre três
   corridas, com a meta escrita ao lado.
4. **Quebrei dois testes ao tirar `difficultyAt` de `GET /api/vocab`.** Procurei leitores em `src/`
   e não no repositório. Um relatório paralelo os classificou como "já falhavam em HEAD", o que era
   verdade e enganoso: HEAD já era o meu commit.

E uma disciplina que só apareceu medindo: **cópia nova do banco a cada corrida de carga**. Cada
corrida grava ~16 mil linhas, e reaproveitar o banco da anterior derruba a seguinte — 108 req/s numa
cópia limpa contra 59 req/s no banco engordado.

## 7. Defeitos preexistentes encontrados no caminho, e não consertados aqui

- **`createSessionSchema` aceita 5.000 falas e o repositório estoura antes disso.**
  `createWithUtterances` manda tudo num `db.batch()` só e falha com `SQLITE_ERROR: too many SQL
  variables`. Medido: 1.500 passam; 2.000 e 4.000 respondem **400 "erro interno"**. O limite real
  fica entre 1.500 e 2.000 (~32766/16 colunas).
- **300 conexões TCP novas no mesmo tique** produzem `ECONNREFUSED` no cliente com o log do servidor
  limpo. Testei a hipótese de prontidão (esperar `/api/ready` em vez de `/api/health`) e ela falhou
  igual, o que a derruba: o limite é do lado do cliente. Com o pool quente, o mesmo servidor atende
  300 de uma vez.
- **Windows não entrega sinal**: `process.kill(pid,'SIGTERM')` chama `TerminateProcess` e o handler
  nunca roda. O teste manda o sinal de verdade em POSIX e, no Windows, pede por IPC que o processo
  emita o mesmo evento — o caminho exercitado é idêntico.

## 8. O que não foi feito, e por quê

- **OpenTelemetry.** Não entrou. O que a fase entregou — `request_id` em toda linha, histograma por
  rota, `/ready` — cobre a pergunta operacional sem preload no boot, e o arranque já piorou 400 ms
  sem ele. Fica como decisão aberta.
- **`computeProfile`.** §3, com o número medido.
- **Desempenho de cliente** (lazy por jogo, Lighthouse antes/depois). Não foi feito.
- **Job de carga no CI.** O k6 roda à mão, com cópia limpa; automatizá-lo exige um runner com o
  banco semeado.

## 9. Ferramentas

`k6` v2.2.0 **não foi instalado no sistema**: o `winget` exige elevação, e o Docker Desktop não
estava de pé. O binário oficial de `github.com/grafana/k6/releases` foi baixado para o diretório
temporário da sessão e executado de lá. O cabeçalho de `carga.k6.js` documenta os dois caminhos.

## 10. Commits

| commit | o quê |
|---|---|
| `933a77c` | roteiro k6 e teste de concorrência (autorados) |
| `f16bf65` | `GET /api/vocab` sem seis colunas |
| `378f5ab` | a mesma lista em `get`, e o conserto das duas quebras |
| `22a635d` | `request_id` implícito, `/metrics`, `/api/ready` |
| `b8cc9f2` | desligamento gracioso, disjuntor, fim do estado por processo |
| `6c17149` | teto na listagem de resultados — 2,9× mais vazão |

## 11. Bateria verde ao fim da fase

**3.901 testes**, 0 falhas. `tsc` · `typecheck:estrito` · `eslint --max-warnings 0` · `madge` ·
`ast-grep test` (6) + `scan` · `rotas-sem-caracterizacao` (87 rotas) · `rotas-sem-consumidor` ·
`npm run build` · `k6 run scripts/perf/carga.k6.js` contra cópia limpa — todos exit 0.
