# Desempenho do servidor e da conversa cliente ↔ servidor (10/10/2026)

Pergunta do dono: o servidor vai para o Fly.io numa máquina pequena (um processo, SQLite num volume,
Litestream). O que nele, e na forma como o cliente o chama, gasta mais do que precisa?

Esta etapa **não corrige nada**: lê o código, mede o que é leve e entrega a lista ordenada. Branch
`feat/polimento-movimento` (`b6a79579`). Nenhum arquivo do repositório foi alterado além deste.

Cada afirmação abaixo leva uma de três marcas:

- **[medido]** número tirado nesta sessão, com o método da seção 1;
- **[lido]** conferido por mim no código, com `arquivo:linha`;
- **[lido por subagente]** levantado por um agente de leitura e **não** reconferido linha a linha por
  mim (conferi por amostragem; o que conferi está marcado como [lido]).

## 0. Resumo

O servidor está em bom estado para o tamanho do lançamento: as auditorias de 25–26/09 já tiraram os
defeitos grandes (seção 6), e as rotas baratas continuam baratas (1–4 ms). O que sobra é de três tipos:

1. **Rotas novas que releem o histórico inteiro a cada chamada.** As rotas das recompensas v2
   (`missoes`, `temporada`, `maestria`, `xp`) e `exercises/historico` nasceram depois do conserto do
   perfil e não usam o cache por versão que ele ganhou. `missoes` é pedida em **toda abertura do app**.
2. **O cliente pede a mesma coisa mais de uma vez.** Abrir o app são 16 pedidos a `/api` medidos em
   desenvolvimento, cerca de 11 a 13 estimados em produção, dos quais 4 a 5 são repetição.
3. **Escritas que não precisam ir ao disco.** Todo limitador de taxa conta no SQLite, inclusive o da
   leitura de flags, que o cliente sonda a cada 5 minutos; e cada chamada de IA faz de 6 a 8 escritas
   separadas.

Nada disso é dinheiro direto no Fly (a máquina é preço fixo). É CPU de um núcleo compartilhado, que é
exatamente o recurso que acaba primeiro (`docs/escala.md`: o `shared-cpu-1x` sustenta 6,25 % de um
núcleo). O único item com dinheiro por uso é a IA: chamada que continua depois de o cliente desistir e
voz sintetizada de novo para a mesma frase (achados 7 e 9).

## 1. Método e limites da medição

| Item | Valor |
|---|---|
| Máquina | Ryzen 5 5600, 16 GB, Windows 11, Node 24.18.0, **com outros agentes rodando** |
| Servidor | `tsx server.ts` (desenvolvimento, **não** o bundle de produção), porta 3210, um processo |
| Banco | `%TEMP%\e2e-babel\perf-srv.db`, migrations reais + `scripts/perf/escala/semear.mjs --pesados=3 --medios=10 --leves=5 --mega-sessoes=60` (22 MB) |
| Usuário "mega" (`local-owner`) | 3.000 cartões, 60 sessões × 100 falas, 5.000 revisões, 5.000 exercícios |
| Usuário "pesado" (`u-p-0000`) | 3.000 cartões, 20 sessões × 100 falas, 1.000 revisões, 1.000 exercícios |
| Modo self-host | `PORT=3210 node subir-dev.mjs` (sem login); usuário mega |
| Modo público | `AUTH_REQUIRED=1` com JWKS ES256 local na 3211 (o desenho de `scripts/perf/escala/carga-servidor.mjs`); usuário pesado |
| Tempo e bytes | um cliente, uma conexão, em série, 5 a 15 repetições por rota; p50 e p95; corpo cru e como viaja (`Accept-Encoding: gzip, deflate, br`) |
| Consultas por rota | `scripts/perf/consultas/coletor.cjs` (o coletor da auditoria de 26/09) via `NODE_OPTIONS` |
| Mapa de chamadas | Chromium (Playwright) abrindo cada tela por carga direta; contagem pelo coletor do servidor |

O que isso **não** é:

- Não é teste de carga. Sem concorrência, o p50 de uma rota é praticamente o tempo de CPU dela; não
  diz nada sobre fila.
- É `tsx` em desenvolvimento. O bundle de produção tende a ser igual ou mais rápido; os números servem
  para **comparar rotas entre si** e para ordem de grandeza, não como SLO.
- O navegador rodou com `StrictMode` (`src/main.tsx:60`), que em desenvolvimento **dobra os efeitos de
  montagem**. As contagens por tela abaixo são de desenvolvimento; a coluna "produção (estimado)" tira a
  dobra pela leitura do código e não foi medida.
- Nenhuma rota de IA foi chamada com provedor (o ambiente não tinha chave nenhuma: não existe `.env`
  nesta worktree). Tudo de IA é [lido].
- O servidor foi encerrado ao fim; as portas 3210 e 3211 ficaram livres. A 3177 e o `data/babel.db` não
  foram tocados.

## 2. O que foi medido

### 2.1 Rotas do caminho quente — modo público, usuário pesado [medido]

| Rota | p50 ms | p95 ms | corpo cru | no fio (br) | instruções SQL/req | `Cache-Control` |
|---|---:|---:|---:|---:|---:|---|
| GET `/api/flags` | 18,6¹ | 879¹ | 4,3 KB | 1,4 KB | 3,4 | `private, max-age=30` |
| GET `/api/me` | 3,0 | 74¹ | 0,2 KB | — | 5 | — |
| GET `/api/me/entitlements` | 4,2 | 12,8 | 0,3 KB | — | 7 | — |
| GET `/api/me/uso` | 3,9 | 5,7 | 0,5 KB | — | **9** | — |
| GET `/api/me/idade` | 1,9 | 3,2 | 0,2 KB | — | 3 | — |
| GET `/api/settings` | 2,3 | 2,9 | 0,2 KB | — | 3,5 | — |
| GET `/api/billing/status` | 3,7 | 5,6 | 0,1 KB | — | **8** | — |
| GET `/api/metrics/profile` | 4,3 | 155² | 3,0 KB | 1,1 KB | 8,4 | — |
| GET `/api/metrics/missoes` | **14,0** | 26 | 0,3 KB | — | 7 | — |
| GET `/api/metrics/temporada` | **21,9** | 27 | 0,2 KB | — | 10 | — |
| GET `/api/metrics/maestria` | **12,8** | 14 | 1,2 KB | 0,2 KB | 5 | — |
| GET `/api/metrics/xp` | **23,7** | 28 | 12 KB | 1,7 KB | 7 | — |
| GET `/api/vocab` | **44,4** | 236² | **2.158 KB** | **417 KB** | 4,2 | — (ETag de versão) |
| GET `/api/vocab/pagina?limite=200` | 31,5 | 60 | 170 KB | 34 KB | 7 | — |
| GET `/api/vocab/para-jogo` | 24,1 | 27 | 21 KB | 4,6 KB | 5 | — |
| GET `/api/sessions` | 3,5 | 4,9 | 8,4 KB | 1,0 KB | 4 | — |
| GET `/api/sessions/utterances/all` | **79,6** | 84 | **1.008 KB** | 85 KB | 4 | — |
| GET `/api/sessions/:id` (100 falas) | 6,4 | 9,1 | 51 KB | 4,9 KB | 5 | — |
| GET `/api/exercises/results` | 7,3 | 10 | 67 KB | 4,5 KB | 4 | — |
| GET `/api/exercises/historico` | **20,3** | 24 | 136 KB | 10 KB | 4 | — |
| GET `/api/exercises/recordes` | 4,3 | 5,7 | 0,1 KB | — | 4 | — |
| PUT `/api/settings` | 3,2 | 21 | — | — | 8,1 | — |
| POST `/api/metrics/presenca` | 2,6 | — | — | — | 6 | — |

¹ a primeira chamada do processo (busca do JWKS, carga de módulo) puxa o p95; o p50 de `flags` em regime é de 1 a 2 ms.
² a primeira chamada é o caminho frio (sem cache por versão); as seguintes são o quente.

### 2.2 As mesmas rotas com o usuário mega (5.000 revisões + 5.000 exercícios) — self-host [medido]

Só as que **crescem com o histórico**; o resto fica igual.

| Rota | pesado (1.000 + 1.000) | mega (5.000 + 5.000) | ms de banco (mega) | corpo cru (mega) |
|---|---:|---:|---:|---:|
| GET `/api/metrics/missoes` | 14,0 ms | **37,5 ms** | 12,9 | 0,3 KB |
| GET `/api/metrics/temporada` | 21,9 ms | **66,8 ms** | 26,6 | 0,2 KB |
| GET `/api/metrics/maestria` | 12,8 ms | **33,3 ms** | 12,5 | 1,2 KB |
| GET `/api/metrics/xp` | 23,7 ms | **61,2 ms** | 28,0 | 12,8 KB |
| GET `/api/exercises/historico` | 20,3 ms | **179,6 ms** | 14,2 | **421 KB** |
| GET `/api/sessions/utterances/all` | 79,6 ms (2.000 falas) | **227–258 ms** (6.000 falas) | 52–67 | **3.082 KB** (245 KB no fio) |
| GET `/api/metrics/profile` (quente) | 4,3 ms | 2,7 ms | 0,5 | 7,4 KB |

Leitura: `profile` não cresce porque tem cache por versão; as outras releem tudo. Em `historico`, só
14 de 180 ms são banco: o resto é a dobra em memória e a serialização de 421 KB.

### 2.3 Revalidação condicional (`If-None-Match`) [medido]

O navegador guarda a resposta e revalida sozinho. O que o servidor gasta para responder 304:

| Rota | Resposta | p50 | Observação |
|---|---|---:|---|
| GET `/api/vocab` | 304 | **1,8 ms** | ETag da versão: uma consulta de chave primária (`server/routes/vocab.ts:65-72`) |
| GET `/api/sessions` | 304 | 2,6 ms | ETag do corpo, mas o corpo é pequeno |
| GET `/api/sessions/utterances/all` | 304 | **53,6–72,7 ms** | ETag do Express é hash do corpo: o servidor monta 1 MB para descobrir que não mudou |
| GET `/api/exercises/historico` | 304 | 15,5–20,5 ms | idem |
| GET `/api/metrics/profile` | **200** | 3,2 ms | nunca dá 304: o corpo leva `asOf: now` (`server/db/repositories/metrics.ts:620`) |

### 2.4 Custo fixo por requisição autenticada [medido]

`GET /api/sessions` faz 1 instrução no self-host e 4 no modo público: **3 instruções de custo fixo**
(suspensão em `users`, `idades_declaradas` e mais uma), cerca de 0,3 ms de banco. É o mesmo número da
auditoria de 26/09 (§2.1 de lá). As rotas de escrita somam o upsert do limitador em `usage_counters`.

## 3. Mapa de chamadas

### 3.1 Abrir o app (hub), segunda abertura, self-host [medido em desenvolvimento]

| Pedido | Medido (dev, StrictMode) | Produção (estimado pela leitura) | Por quê |
|---|---:|---:|---|
| GET `/api/settings` | 2–4 | 2–3 | `useLangConfig` (`App.tsx:111`), `useAparencia`, `usePreferencias`; só divide o pedido enquanto está em voo (`src/data/rotas/settings.ts:36`) |
| GET `/api/me/entitlements` | 2 | 1 | `App.tsx:179-182` |
| GET `/api/sessions` | 2 | 1 | `App.tsx:212-217` |
| GET `/api/metrics/profile` | **3** | **2** | `useMetricas.ts:48-66`: roda na montagem e de novo quando `quantidadeDeSessoes` sai de 0 |
| GET `/api/exercises/recordes` | **3** | **2** | no mesmo `Promise.all` do perfil |
| GET `/api/metrics/missoes` | 1 | 1–2 | `useMetricas.ts:93-106`: a cada objeto `metrics` novo |
| POST `/api/metrics/seeds/reembolso` | 1 | 1 | `useMetricas.ts:80-87`: uma vez por página, **toda** abertura; 7 instruções |
| GET `/api/me` | 1 | 1 | `usePerfil.ts` (cache de módulo) |
| GET `/api/flags` | 1 | 1 | `flags.ts:180` |
| **Total** | **16** | **11 a 13** | |

No modo público com conta somam-se `GET /api/me/idade` (que **segura** quase todos os outros,
`src/data/funil.ts:130-133`), `GET /api/billing/status` (`AvisoDePagamentoAtrasado.tsx:51`) e, uma vez
por dia, `POST /api/metrics/presenca` [lido por subagente].

**CPU de uma abertura**, somando os p50 do modo público (usuário pesado) pela contagem estimada de
produção: cerca de **70 ms**, dos quais ~28 ms são `missoes` (duas vezes) e ~25 ms são repetição
(`profile`, `recordes`, `missoes`, `settings` pedidos de novo). Para o usuário mega, `missoes` sozinha
passa de 37 ms por chamada.

Primeira abertura da conta semeada [medido]: além do acima, **23 `POST /api/metrics/seeds/creditar`
em série** (uma por conquista devida), 10 instruções e ~80 ms cada: 1,8 s de CPU do servidor numa
rajada. Cada crédito muda a versão dos dados, então o perfil seguinte sai pelo caminho frio.

### 3.2 Por tela — carga direta da URL [medido em desenvolvimento, inclui o arranque]

Só os pedidos **além** do arranque da seção 3.1. Entre parênteses, a contagem medida em desenvolvimento.

| Tela | Pedidos próprios | Maior custo |
|---|---|---|
| Início `/` | nenhum | — |
| Jogar `/jogar` | `anki/decks` (2), `vocab` (1), `settings` (+1), `sessions` (+2), `sessions/:id` (1), `exercises/historico` (2), `exercises/results` (2), `exercises/recordes` (+2), `vocab/para-jogo` (1); com a flag `recompensas_v2`, `metrics/maestria` | `vocab` 2,1 MB na primeira carga; `para-jogo` 24 ms; `historico` 20–180 ms |
| Vocabulário `/vocabulario` | `vocab` (1), `sessions/utterances/all` (2), `exercises/results` (2), `vocab/inicio-da-contagem` (2), `vocab/pagina` (2) | **`utterances/all`: 1–3 MB crus, 80–258 ms** |
| Sessão `/sessao/:id` | `sessions/:id` (3), `vocab` (1), `vocab/pagina` (1), `exercises/results` (1), `sessions/utterances/all` (2) | `utterances/all` de novo³ |
| Loja `/loja` | `metrics/temporada` (2) | 22–67 ms por chamada |
| Perfil `/perfil` | `vocab` (1), `settings` (+1) | — |
| Capturar `/capturar` | `me/uso` (3), `settings` (+2), `vocab` (1), `ai/stt/available` (1), `audio/loopback/support` (2) | — |

³ não rastreei qual componente da tela de sessão pede `utterances/all`; o número é do coletor.

Nenhuma tela guarda cache próprio: sair e voltar refaz tudo, e o cliente não cancela o pedido ao
desmontar (só ignora a resposta) [lido por subagente; `src/data/funil.ts:103-153`]. Em Jogar, sair e
voltar custa os 9 a 10 pedidos outra vez; o baralho volta 304 se nada mudou.

### 3.3 Sondagens periódicas [lido]

| O quê | Intervalo | Onde | Para com a aba oculta? |
|---|---|---|---|
| GET `/api/flags` | 5 min, mais foco (no máximo 1 a cada 30 s), mais troca de identidade e de idioma | `src/lib/flags.ts:177-190` | **Não** (o `setInterval` da linha 188 não olha a visibilidade) |
| GET `/api/billing/status` | 5 s enquanto o checkout espera o pagamento | `Checkout.tsx:364-388`, `Assinado.tsx:58-62` [subagente] | Não |
| GET `/api/me/uso` e `/api/billing/status` | 1 h | `HostDeOfertas.tsx` [subagente] | Não; com cache de 1 h |
| POST `/api/metricas/captura` | 60 s durante a captura | `telemetriaDeCaptura.ts` [subagente] | Não |

Não há sondagem de versão (vem no cabeçalho `x-babel-versao` de toda resposta), de saúde nem de presença.

## 4. Achados

Esforço: **P** até meio dia, **M** um a dois dias, **G** mais que isso.

### A1. Rotas das recompensas releem o histórico inteiro a cada chamada

- **Evidência [lido]**: `GET /api/metrics/maestria` e `/missoes` chamam `exerciseResultsRepo.linhasDeMaestria`
  (`server/db/repositories/exerciseResults.ts:471-489`): todas as linhas de jogo da conta, sem limite.
  `/temporada` e `/xp` chamam `linhasDoHistoricoDeXp` (`server/db/repositories/metrics.ts:770-812`):
  todas as sessões, todas as revisões e todos os exercícios. `/exercises/historico` lê todas as linhas e
  dobra em memória (`exerciseResults.ts:244-278`; o comentário da linha 238 supõe "ordem de centenas de
  linhas"). Nenhuma usa `CachePorVersao`, que o perfil usa (`metrics.ts:672-682`).
- **Custo [medido]**: seção 2.2. Por chamada, de 13–24 ms (1.000 + 1.000 linhas) a 33–180 ms
  (5.000 + 5.000). `missoes` roda em **toda abertura do app** e depois de cada rodada; `historico` em
  toda abertura de Jogar e a cada fim de rodada.
- **Conserto**: guardar as linhas agregadas no mesmo `CachePorVersao`, com a versão `atividade` de
  `versoes_de_dados`. Os gatilhos já cobrem `exercise_results`, `review_logs`, `sessions` e `utterances`
  (`server/db/migrations/0032_versoes_de_dados.sql:64-127`), então não há invalidação a escrever.
- **Ganho esperado**: as cinco rotas caem para a faixa do perfil quente (2–4 ms) enquanto a conta não
  escreve. Uma abertura do app perde ~28 ms de 70 (usuário pesado).
- **Risco**: baixo. A parte que depende do relógio (dia das missões, janela da temporada) tem de ficar
  fora do cache, como `montarPerfil` já faz. Memória: dar peso às entradas, como o resumo do perfil.
- **Esforço**: P a M.

### A2. O cliente repete pedidos no arranque

- **Evidência**: seção 3.1 [medido em dev] e `src/lib/estado/useMetricas.ts:48-66` [lido]: o efeito
  depende de `quantidadeDeSessoes`, que muda quando `GET /api/sessions` responde; perfil e recordes são
  pedidos antes e depois. `missoes` depende do objeto `metrics` (`:93-106`) e roda de novo. `settings` é
  lida por três donos e só divide o pedido enquanto ele está em voo.
- **Custo**: 4 a 5 pedidos por abertura, ~25 ms de CPU (usuário pesado), mais os 3 de custo fixo de
  cada um no modo público.
- **Conserto**: pedir as métricas uma vez, depois de as sessões chegarem (ou tirar a dependência, já que
  o perfil é da conta e não da lista); `missoes` só quando o que ela lê mudou; uma leitura de `settings`
  por página, entregue aos três donos.
- **Ganho esperado**: de 11–13 para 7–8 pedidos por abertura.
- **Risco**: baixo, mas é código de tela (`src/`), onde outro agente está trabalhando.
- **Esforço**: P.

### A3. `GET /api/sessions/utterances/all` devolve todas as falas da conta

- **Evidência [lido]**: `server/routes/sessions.ts:155-157` → `utterancesRepo.listAll`
  (`server/db/repositories/utterances.ts:158-164`): `SELECT *`, sem limite, sem paginação. O cliente
  pede ao abrir Vocabulário (`src/components/views/Metrics.tsx:182-187`, para o painel "Complexidade
  Estrutural & Tom") e na Auditoria de Idioma.
- **Custo [medido]**: 1.008 KB e 80 ms com 2.000 falas; 3.082 KB e 227–258 ms com 6.000. O laço de
  eventos fica preso esse tempo todo (driver síncrono). O 304 não economiza CPU (53–73 ms). O teto do
  schema é 5.000 falas **por sessão**, então a conta não tem teto.
- **Conserto**: a tela usa um agregado; calcular no servidor (ou devolver só as colunas que o painel lê)
  e pedir quando o painel aparece. No mínimo, ETag pela versão `atividade` para o 304 custar 1 consulta.
- **Ganho esperado**: tira de 80 a 258 ms de bloqueio e de 1 a 3 MB de cada abertura de Vocabulário.
- **Risco**: médio (o painel precisa dar os mesmos números; a Auditoria de Idioma precisa do texto).
- **Esforço**: M.

### A4. Todo limitador de taxa escreve no SQLite, inclusive o da leitura de flags

- **Evidência [lido]**: `createDbRateLimitStore` (`server/lib/rateLimitStore.ts:84-129`) faz um upsert
  em `usage_counters` por requisição. Está em `/api/flags` (`server/http/app.ts:390-402`), em
  `/api/metricas` (`:363-375`), nas rotas caras (`:260-269`, `:464`) e em toda escrita (`:287-297`,
  `:487-523`). O motivo registrado é contar entre réplicas; a topologia aprovada é **uma** máquina
  (ADR 0006), e o próprio código já tem limitador em memória para leitura (`limitadorDeLeitura`).
- **Custo [medido]**: `GET /api/flags` faz 3,4 instruções no modo público contra 0–1 no self-host. O
  cliente sonda as flags a cada 5 min por aba aberta, visível ou não (seção 3.3): com 100 abas, uma
  escrita a cada 3 s só de flags, com o app parado. Cada escrita deixa WAL novo para o Litestream
  enviar no próximo ciclo de 10 s (`litestream.yml:31`).
- **Dinheiro**: irrelevante. No pior caso (WAL sujo em todo ciclo) são 259.200 PUT por mês no R2, dentro
  da faixa gratuita de operações classe A. O custo é escrita e CPU, não fatura.
- **Conserto**: guardar em memória quando há um processo só (manter o do banco atrás de
  `CLUSTER_WORKERS > 1`); no cliente, não sondar flags com a aba oculta.
- **Ganho esperado**: uma escrita a menos por requisição de escrita, de IA e de telemetria; zero escrita
  em repouso.
- **Risco**: baixo. Reiniciar o processo zera os baldes de um minuto.
- **Esforço**: P.

### A5. Uma chamada de IA faz de 6 a 8 escritas separadas, aguardadas antes de responder

- **Evidência**: [lido] `reservarNoMesENoDia` (`server/lib/usageQuota.ts:301-325`) faz uma reserva do
  mês e outra do dia, cada uma um `await`; `registrarGastoDeIa` (`server/lib/orcamentoDeIa.ts:300-316`)
  soma o mês e o dia em dois `await`; em `/api/ai/mt` o acerto de tokens e o gasto são aguardados antes
  de decidir a resposta (`server/ai/nucleo/traduzirNoNivel.ts:378-392`). [lido por subagente] contagem
  completa: STT 6 escritas (limitador, chamada, segundos do mês, segundos do dia, gasto do mês, gasto do
  dia), MT 8 antes da resposta e 1 depois.
- **Custo (estimado, não medido)**: uma pessoa capturando com nuvem faz cerca de 10 STT + 10 MT por
  minuto (`fase2-escala.md` §3): ~140 escritas por minuto, 2,3 por segundo, por pessoa. O teto medido do
  escritor único no Fly era de 80 a 160 escritas por segundo (`fase2-escala.md` §2.2): de 35 a 70
  pessoas capturando ao mesmo tempo o alcançam.
- **Conserto**: juntar as reservas num `db.batch` (cada uma continua condicional numa instrução) e fazer
  a contabilidade do gasto depois da resposta, num lote só.
- **Ganho esperado**: de 14 para ~4 idas ao banco por par STT + MT; alguns décimos de milissegundo a
  menos na legenda; o teto de gente capturando sobe na mesma proporção.
- **Risco**: médio. A reserva de cota não pode voltar a ser ler e depois gravar (P0-1 da auditoria
  antiga); o lote precisa devolver quais reservas couberam.
- **Esforço**: M.

### A6. O servidor HTTP não define nenhum tempo limite

- **Evidência [lido]**: nenhuma ocorrência de `keepAliveTimeout`, `headersTimeout` ou `requestTimeout`
  em `server.ts` e `server/**`; `server.ts:321` é só `app.listen`. É a recomendação 4 da Fase 4
  (`fase4-carga.md` §8), ainda aberta: com os 5 s padrão do Node atrás do proxy do Fly, um socket
  fechado pelo servidor no instante em que o proxy o reusa vira erro de conexão (a suíte viu de 8 a 149
  repetições por minuto).
- **Conserto**: `server.keepAliveTimeout` acima do ocioso do proxy do Fly, `headersTimeout` acima dele,
  e um `requestTimeout` explícito. Conferir o valor do proxy antes.
- **Ganho esperado**: some uma classe de 502 esporádico e de repetição do cliente.
- **Risco**: baixo. **Esforço**: P.

### A7. A chamada ao provedor de IA continua depois de o cliente desistir

- **Evidência**: [lido] a única escuta de fechamento nas rotas de IA é
  `res.on('close', () => fecharPortaDoStt(porta))` (`server/ai/sttProxy.ts:82`), que **solta a vaga** do
  usuário mas não aborta a chamada. [lido por subagente] todos os sinais são `AbortSignal.timeout(...)`:
  STT 30 s por tentativa (`cascataDeStt.ts:63`), MT 12 s, alternativas 15 s, polir 45 s, tutor 30 s,
  TTS 12 s. Pior caso teórico de um STT: 120,5 s com uma perna (reenvio em `json` + retentativa de 5xx).
- **Custo**: dinheiro (a transcrição ou a tradução é paga e jogada fora) e a cota do usuário, que é
  debitada. Como a vaga é solta no fechamento, quem fecha e reabre empilha chamadas em voo. Não medido:
  depende de com que frequência o cliente cancela (os adaptadores de IA do cliente passam `signal`).
- **Conserto**: um `AbortController` por requisição, ligado ao `close` da resposta e combinado com o
  tempo limite (`AbortSignal.any`); soltar a vaga só quando a chamada ao provedor de fato terminar.
- **Risco**: baixo a médio (estornar a reserva no cancelamento). **Esforço**: P a M.

### A8. Rajada de créditos: um POST por conquista, cada um recalculando o perfil

- **Evidência [medido]**: 23 `POST /api/metrics/seeds/creditar` em série na primeira abertura da conta
  semeada, 10 instruções e ~80 ms cada (1,8 s de CPU); cada um dispara `babel:conquista`, que refaz
  perfil, recordes e missões (`useMetricas.ts:42-47`).
- **Quando acontece**: conta que acumula conquistas de uma vez (importou um baralho Anki, voltou depois
  de muito tempo, ou é antiga e uma regra nova passou a valer). No uso do dia a dia é um crédito por vez.
- **Conserto**: uma rota que reconcilia tudo o que é devido numa chamada (o servidor já confere cada
  crédito de novo), e uma só releitura das métricas no fim.
- **Risco**: médio (economia: idempotência por `creditoId` tem de continuar). **Esforço**: M.

### A9. A voz da nuvem não é reaproveitada

- **Evidência [lido por subagente; cabeçalho conferido em `server/ai/ttsProxy.ts:46`]**: `POST /api/ai/tts`
  responde `Cache-Control: no-store`; o único cache é em memória, 8 MB e 10 minutos
  (`server/ai/nucleo/sintetizarVoz.ts:156-207`). A mesma palavra ouvida amanhã, ou por outra pessoa, é
  sintetizada e paga de novo.
- **Custo**: dinheiro por síntese repetida. Não estimei: depende do preço do provedor de voz escolhido
  (ver `docs/auditoria/2026-10-09-medicoes-de-nuvem.md`) e de quanto as frases se repetem, que ninguém
  mediu. Palavra solta do baralho é o caso que mais repete.
- **Conserto**: guardar o áudio de texto curto (a regra do cache de tradução: sem cara de dado pessoal)
  no R2 ou em disco, pela mesma chave SHA-256 que já existe; e deixar o navegador guardar a resposta.
- **Risco**: médio (LGPD: frase do usuário guardada; por isso só texto curto). **Esforço**: M.

### A10. `GET /api/vocab` continua sendo o baralho inteiro em 17 lugares

- **Evidência**: [medido] 2.158 KB crus, 417 KB no fio, 44 ms no quente e 236 ms no frio. O 304 custa
  1,8 ms. [lido por subagente] `fetchDeck()` tem 17 chamadores (Jogar, Vocabulário, Revisão, Análise,
  Leitura, Perfil, Estatísticas, Busca global, iChat…); a memória do cliente some ao recarregar.
- **O que continua valendo de antes**: toda revisão e toda rodada mudam a versão, então a próxima tela
  que pede o baralho baixa os 417 KB de novo pelo caminho frio. É o item 1 dos "sem correção" da
  auditoria de 26/09, com o mesmo caminho proposto: sincronização incremental por `updated_at`.
- **Esforço**: G. Fica na lista, mas não é o primeiro.

### A11. Achados menores

| # | Achado | Evidência | Conserto | Esforço |
|---|---|---|---|---|
| a | `GET /api/me/uso` faz 9 instruções, 5 delas o mesmo `SELECT` em `usage_counters` com janelas diferentes | [medido] | uma consulta com `IN` | P |
| b | `GET /api/billing/status` faz 8 instruções: `subscriptions` 3 vezes, `testes_premium` 2 | [medido]; o `memoDoRequest` de 26/09 não cobre este caminho | usar o memo | P |
| c | `GET /api/metrics/profile` nunca responde 304 por causa de `asOf` | [medido], `metrics.ts:620` | ETag pela versão, `asOf` fora do hash | P |
| d | O cliente não cancela pedidos ao sair da tela | [lido por subagente], `src/data/funil.ts` | `AbortController` nos pedidos pesados (`utterances/all`, `vocab`, `sessions/:id`) | M |
| e | Cada mudança de preferência é um GET + PUT do blob `ui` inteiro, sem espera em `preferencias.ts`; idioma na captura custa GET + PUT + PUT | [lido por subagente] | volume baixo; juntar com A2 | P |
| f | `duracaoDoAudio` roda 6 vezes sobre o mesmo áudio num STT, com CRC do Ogg em JS no laço de eventos | [lido por subagente], **não conferido nem medido** | calcular uma vez por requisição | P |
| g | `express.json` aceita 5 MB em `/api/ai` e `/api/tutor`, embora os esquemas aceitem 4.000 a 10.000 caracteres | [lido por subagente], `server/http/limitesDeCorpo.ts:25` | teto por rota | P |
| h | STT com `x-credential-id` (chave própria) lê os 25 MB antes de conferir se a credencial existe, sem vaga em voo | [lido por subagente], `server/ai/sttProxy.ts:42`, **não conferido** | conferir antes de ler o corpo | P |
| i | PRAGMAs: só WAL, `busy_timeout`, `synchronous=NORMAL` e `foreign_keys` (`server/db/db.ts:88-93`); `cache_size`, `mmap_size` e `temp_store` ficam no padrão | [lido]; efeito **não medido** | testar no volume do Fly antes de mexer | P |
| j | Importação (PDF, DOCX, página web, `.apkg`) é interpretada dentro da requisição, no laço de eventos | [lido], `server/import/document.ts`, `web.ts`, `anki.ts`; **não medido agora** | `worker_threads` ou a fila do ADR 0007 | G |

### A12. `functions/quest/stt.js` responde só depois de traduzir

- **Evidência [lido]**: `functions/quest/stt.js:566` chama o Whisper; `:586` espera `traduzir(...)`;
  `:588` responde tudo de uma vez. Não há tempo limite em nenhum `env.AI.run`.
- **É de propósito**: o comentário das linhas 580-583 explica que a tradução vai "na mesma viagem" para o
  aparelho fraco não pagar tradutor local nem uma segunda ida à rede. A tradução depende do texto, então
  não dá para paralelizar.
- **Custo**: a transcrição pronta espera o tempo da tradução para aparecer. Não medido aqui (a resposta
  devolve `ms` e `msTraducao`; o número está nos registros de produção, não neste repositório).
- **Conserto possível**: responder em duas partes (NDJSON: texto primeiro, tradução depois) e pôr tempo
  limite nas duas chamadas. Só vale se `msTraducao` for uma fração relevante de `ms`.
- **Risco**: médio (o cliente do Quest precisa ler a resposta em partes). **Esforço**: M.

## 5. Lista ordenada por ganho ÷ esforço

| Ordem | Achado | Ganho | Esforço | Onde mexe |
|---:|---|---|---|---|
| 1 | **A1** cache por versão nas rotas das recompensas e em `historico` | −13 a −180 ms por chamada, em toda abertura e todo fim de rodada | P–M | servidor |
| 2 | **A2** uma leitura de métricas, missões e settings no arranque | −4 a −5 pedidos por abertura (~35 % da CPU dela) | P | cliente |
| 3 | **A4** limitadores em memória; flags não sondam com aba oculta | −1 escrita por requisição de escrita e de IA; zero escrita em repouso | P | servidor + cliente |
| 4 | **A6** tempos limite do servidor HTTP | some uma classe de erro de conexão atrás do proxy | P | servidor |
| 5 | **A3** `utterances/all` vira agregado (ou ganha ETag de versão) | −80 a −258 ms e −1 a −3 MB por abertura de Vocabulário | M | servidor + cliente |
| 6 | **A7** abortar o provedor quando o cliente fecha | dinheiro de IA e cota não desperdiçados | P–M | servidor |
| 7 | **A11 a, b, c** consultas repetidas e 304 do perfil | −5 a −9 instruções em três rotas | P | servidor |
| 8 | **A5** escritas da IA em lote | 14 → ~4 idas ao banco por par STT + MT | M | servidor |
| 9 | **A8** reconciliar créditos numa chamada | −1,8 s de CPU numa rajada rara | M | servidor + cliente |
| 10 | **A9** voz guardada | dinheiro de TTS (não estimado) | M | servidor |
| 11 | **A12** Quest: resposta em duas partes | latência percebida (não medida) | M | função + cliente |
| 12 | **A10** baralho incremental | −417 KB e −44 a −236 ms depois de cada escrita | G | servidor + cliente |
| 13 | **A11 d–j** | pequenos ou não medidos | P–G | vários |

Os quatro primeiros são pequenos e independentes entre si.

## 6. O que as auditorias anteriores já resolveram, e continua resolvido

Conferido no código de hoje ou reconfirmado pela medição:

| Item | Origem | Estado hoje |
|---|---|---|
| ETag de versão e cache do corpo em `GET /api/vocab` | `fix/rotas-caras`, 25/09 | [medido] 304 em 1,8 ms; `server/routes/vocab.ts:51-81` |
| Perfil com cache por versão | idem | [medido] 2,7–4,3 ms no quente; `metrics.ts:672-682` |
| Compressão das respostas e estáticos pré-comprimidos com `immutable` | Fase 4 e 5 | [medido] `br` em toda resposta grande; `server/http/estaticos.ts` |
| `index.html` com `no-cache`, `/assets/*` 1 ano | Fase 5 | [lido] `estaticos.ts:33-47`, igual ao `public/_headers` |
| Índices do lado filho das chaves estrangeiras | 26/09, migração 0034 | [lido] `server/db/schema.ts` |
| Boot sem varrer `vocab_cards` | 26/09, migração 0035 | não remedido |
| Plano lido uma vez por requisição | 26/09 | [medido] vale para IA; **não** cobre `billing/status` (A11b) |
| Transação fora do caminho quente (`db.batch` no lugar) | auditoria v2 | [lido] só `testesPremium.ts:46` usa `emTransacao` |
| Limitador de força bruta sem escrita em requisição válida | Fase 2 | [lido] `app.ts:431-443` |
| Uploads em streaming com semáforo | Fase 2 | não remedido |
| Snapshot diário em processo filho | Fase 2 | [lido] `server.ts:383-391` |
| Litestream a cada 10 s | Fase 3 | [lido] `litestream.yml:31` |
| `exercises/results` com teto padrão | Fase 5 de 09/09 | [medido] 67 KB sem filtro |
| Capa de sessão fora do JSON | 07/09 | [medido] `sessions` 8–25 KB |
| Poda de `usage_counters`, cache de tradução, convidados, marcas de teste, áudio | várias | [lido] agendadas em `server.ts:396-438` |
| Tradução com cache L1 + L2 | 28/09 | [lido por subagente] `server/ai/cacheDeTraducao.ts` |
| Tempo limite em toda chamada a provedor | 09/09 | [lido por subagente] |

Continua **aberto** de antes: baralho incremental (A10), tempos limite HTTP (A6), importação no laço de
eventos (A11j), `cortesDeFaixa` lendo 3.000 dificuldades por seleção (`para-jogo`, 24 ms medidos hoje).

`review_logs`, `exercise_results` e `vocab_occurrences` crescem sem limpeza por desenho (são o histórico
do usuário). O custo desse crescimento é o achado A1, não o tamanho do banco.

## 7. O que virar portão na CI

O job `carga` hoje cobra o orçamento do bundle, o p95 de quatro rotas baratas e a suíte com 10 usuários.
Nenhum desses pega os achados acima, porque nenhum conta pedidos nem consultas.

1. **Instruções SQL por rota** (o desenho de `tests/integration/rotas-caras-equivalencia.test.ts`):
   teto para `missoes`, `temporada`, `maestria`, `xp`, `historico`, `me/uso` e `billing/status`, e
   "segunda chamada sem escrita no meio não lê o histórico".
2. **Pedidos por abertura do app**: um teste de navegador sobre o build de produção (sem `StrictMode`)
   que conta os pedidos a `/api` ao abrir o hub e falha acima de um teto; e que nenhuma URL sai duas
   vezes.
3. **Tamanho de resposta**: nenhuma rota de leitura acima de 300 KB crus no banco da suíte (a regra já
   existe em `openspec/specs/arranque-e-payloads-medidos`, sem portão), com `vocab` como exceção
   declarada até A10.
4. **Zero escrita em repouso**: N leituras de `/api/flags` e de rotas GET não mudam `db_escritas_total`.
5. **Rotas novas na suíte**: `scripts/perf/suite/cenarios.mjs` e `medir-rotas.mjs` não conhecem as rotas
   das recompensas nem `utterances/all`; entrar nelas é o que faria a suíte ver o A1 e o A3.

## 8. O que não foi medido

- **Carga real e concorrência**: tudo aqui é um cliente em série. Fila, p99 e ponto de quebra são os da
  Fase 4 (25/09), anteriores às rotas das recompensas.
- **Fly.io**: velocidade do núcleo compartilhado, disco do volume, proxy, `keepAlive`, RSS do Litestream.
  Os milissegundos daqui são de um Ryzen com outros processos; no `shared-cpu-1x` são maiores.
- **Rede real**: latência do Brasil, celular, tempo de transferência de 417 KB.
- **O bundle de produção**: medi `tsx` em desenvolvimento; e o navegador com `StrictMode`.
- **Modo público com conta no navegador**: o mapa de telas foi medido no self-host. A espera por
  `/api/me/idade`, `billing/status` e as ofertas vêm da leitura.
- **IA**: nenhuma chamada a provedor; latência, custo por chamada, taxa de cancelamento e taxa de
  repetição de frase (cache de voz) não têm número aqui.
- **`functions/quest/*`** em produção: não chamei.
- **Importações** (PDF, DOCX, web, Anki) e **uploads de áudio**: não medidos nesta rodada.
- **Memória**: não medi RSS. Os caches somam até 64 MB (baralhos) + 48 MB (resumos) + 8 MB (voz) de teto.
- **PRAGMAs** (`cache_size`, `mmap_size`): sem medição; não recomendo mexer sem medir no Fly.

## 9. Reproduzir

```bash
# banco
node --input-type=module -e "import {createClient} from '@libsql/client'; import {drizzle} from 'drizzle-orm/libsql'; import {migrate} from 'drizzle-orm/libsql/migrator'; const c=createClient({url:'file:<tmp>/perf-srv.db'}); await migrate(drizzle(c),{migrationsFolder:'server/db/migrations'}); c.close()"
node scripts/perf/escala/semear.mjs --db=<tmp>/perf-srv.db --pesados=3 --leves=5 --medios=10 --mega-sessoes=60
# servidor self-host com o coletor de consultas
PORT=3210 DATABASE_URL=file:<tmp>/perf-srv.db AUDIO_DIR=<tmp>/audio BACKUP_DIARIO=0 \
  COLETOR_DIR=<dir> NODE_OPTIONS="-r ./scripts/perf/consultas/coletor.cjs" node subir-dev.mjs
# modo público: AUTH_REQUIRED=1 e SUPABASE_URL apontando para um JWKS ES256 local,
# como em scripts/perf/escala/carga-servidor.mjs (linhas 75-103)
```

Os scripts de medição desta sessão (um cliente em série com `http`, e o somador do coletor) ficaram no
rascunho da sessão e não foram versionados; cabem em `scripts/perf/medir-rotas.mjs`, que já faz quase o
mesmo e só precisa das rotas novas, do token e do tamanho no fio.
