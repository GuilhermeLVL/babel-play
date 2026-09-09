# Relatório final — rodada de saneamento 2026-09

Branch `saneamento/2026-09-08`, a partir de `main` @ `47ecf10`. **55 commits, 32 changes OpenSpec
arquivadas, seis fases.**

Máquina: Windows 11, Node v24.18.0. Toda medição de servidor com os mesmos parâmetros da linha de
base: `node dist-server/server.cjs`, `NODE_ENV=production`, `AUTH_REQUIRED=0`, `127.0.0.1`, **cópia**
do banco real.

**EXEC** = confirmado por execução nesta rodada. **lido** = inferido por leitura.

---

## 1. Antes e depois, pelo mesmo comando

| # | métrica | baseline (08/09) | final (09/09) | estado |
|---|---|---|---|---|
| 1 | arquivos rastreados | 1.339 | 1.818 | EXEC |
| 2 | linhas: src / server / tests | 80.025 / 64.303 / 36.396 | 84.004 / 67.867 / **48.142** | EXEC |
| 3 | `server.ts` | 703 linhas | **412** | EXEC |
| 4 | dependências diretas | 28 prod + 32 dev | 29 + 36 | EXEC |
| 5 | **testes vitest** | 3.527 (com **1 erro não tratado que derrubava a CI**) | **3.901, 0 falhas** | EXEC |
| 6 | **testes e2e** | 26, **1 viewport** | **99 em 3 viewports** (375/768/1280), 15 pulados, 0 instáveis | EXEC |
| 7 | cobertura (linhas / ramos / funções) | 42,8 / 34,5 / 36,7 % | **45,1 / 36,9 / 38,9 %** | EXEC |
| 8 | cobertura de `server/routes` | 55,6 % | **72,3 %** | EXEC |
| 9 | lint | 0 erros, 0 avisos | 0 / 0 | EXEC |
| 10 | typecheck | `tsc` ok; `strict` só em `src/core` | `tsc` ok + **`strict` na árvore inteira** | EXEC |
| 11 | vulnerabilidades | 18: 5 alta, 13 moderada | 17: **4 alta** (todas na allowlist nomeada, sem fix upstream), 13 moderada (todas em devDependencies) | EXEC |
| 12 | segredos no histórico | 2 achados (a mesma constante de teste) | **0** — allowlist por valor, 349 commits varridos | EXEC |
| 13 | SAST genérico | não existia | semgrep 1.176.1 no CI; 1 aviso em `server/` (o mesmo que a regra própria já acusa), 0 em `src/` | EXEC |
| 14 | código morto (arquivos / deps) | 0 / 0 (gate já valia) | 0 / 0 | EXEC |
| 15 | ciclos de importação | 0 | 0 — e o portão **pegou 17** que a divisão do funil criou | EXEC |
| 16 | regras arquiteturais (ast-grep) | 3 avisos, 6 regras | 7 avisos, 6 regras com fixture; os globs reescritos **por camada** | EXEC |
| 17 | rotas com caracterização | não havia censo | **87 rotas, 0 sobrando** | EXEC |
| 18 | rotas sem consumidor | não havia censo | **87 rotas, 0 órfãs** | EXEC |
| 19 | bundle: arranque / total | 210 / 1.660 KB gz | 209 / 1.663 KB gz | EXEC |
| 20 | arranque até health 200 | 1.334 ms | **1.742 ms** (piorou) | EXEC |
| 21 | recuperação após `kill -9` | 1.405 ms, 0 perdidos, integrity ok | 1.649 ms, **0 perdidos**, integrity ok | EXEC |
| 22 | CI em `main` | **vermelha** | verde na branch, com 5 portões novos | EXEC |
| 23 | `docker build` | **falhava** (defeito anterior a esta rodada, ver §7) | ok, 865 MB, `/api/ready` 200, `docker stop` em 563 ms com saída 0 | EXEC |

### Latência por rota (10 conexões, 15 s, mesma cópia do banco)

| rota | p50 antes | p50 depois | p95 antes | p95 depois |
|---|---:|---:|---:|---:|
| `GET /api/health` | 2 | 2 | 2 | 3 |
| `GET /api/me` | 4 | 5 | 7 | 9 |
| `GET /api/metrics/profile` | 354 | 371 | 372 | 422 |
| `GET /api/metrics/xp` | 14 | 15 | 15 | 19 |
| `GET /api/exercises/recordes` | 7 | 8 | 8 | 11 |
| `GET /api/vocab/para-jogo` | 40 | 43 | 41 | 72 |
| **`GET /api/vocab`** | **991** | **925** | **1.576** | **1.476** |
| `GET /api/sessions` | 4 | 5 | 6 | 7 |
| `GET /api/exercises/results` | 37 | 40 | 39 | 70 |
| `GET /api/rank/termo` | 2 | 2 | 3 | 3 |
| `POST /api/exercises/rodada` | 27 | 29 | 38 | 50 |
| `POST /api/vocab/:id/review` | 14 | 14 | 20 | 33 |

**Leitura honesta: fora de `/api/vocab`, tudo está dentro do ruído da máquina.** Este medidor
exercita uma rota por vez; o ganho da rodada não aparece nele. Aparece no teste de carga, que é o
cenário em que as rotas competem:

| carga (50 VUs, jornada completa, cópia limpa) | antes | depois |
|---|---:|---:|
| tráfego recebido | 1,1 GB | **46 MB** |
| requisições | 5.729 | **16.320** |
| req/s | 37,0 | **108,8** |
| jornadas completas | 337 | 960 |
| p95 global | 2,81 s | **1,11 s** |
| 5xx | 0 | 0 |

### Lighthouse (execução única, não mediana de 3 como na baseline)

| rota | preset | perf antes | perf depois | observação |
|---|---|---:|---:|---|
| `/` | desktop | 93 | 97 | |
| `/` | mobile | 82 | 78 | |
| `/jogar` | desktop | 70 | 72 | **CLS 0,51 continua** |
| `/jogar` | mobile | 26 | 47 | TBT 1.518 → 13 ms; LCP 6,7 → 7,8 s |

Não houve trabalho de desempenho de cliente nesta rodada. A melhora de `/jogar` mobile é
provavelmente efeito da divisão dos arquivos-deus sobre o code-splitting, mas com **uma** execução
por célula não dá para separar isso de variação — está registrado como observação, não como
resultado.

---

## 2. O que cada fase entregou

| fase | changes | o que fica |
|---|---:|---|
| 0 — linha de base | 5 | 27 métricas medidas, e a descoberta de que **a CI nunca tinha passado** |
| 1 — rede de segurança | 6 | caracterização HTTP dos 11 fluxos críticos, snapshots de contrato, e2e em 3 viewports, testes de banco |
| 2 — código morto | 7 | remoção por categoria com evidência; 3 diagnósticos da auditoria anterior corrigidos |
| 3 — estrutura e padrão | 6 | 7 arquivos-deus divididos (15.833 → 9.963 linhas), `strict` na árvore inteira, prettier/husky/import sort, 4 ADRs |
| 4 — segurança | 8 | matriz rota × guarda lida do Express, IDOR em 19 rotas, schema em toda entrada, redação de log |
| 5 — observabilidade e desempenho | 8 | `request_id` implícito, `/metrics`, `/api/ready`, desligamento gracioso, disjuntor, 2,9× de vazão |
| 6 — documentação e entrega | 1 | runbook, CONTRIBUTING, mapa de arquitetura, este relatório |

---

## 3. Os achados que não vieram de auditoria nenhuma

Estes não estavam em relatório anterior, em issue, nem em comentário. Apareceram por medição.

| achado | como apareceu | efeito |
|---|---|---|
| **A CI nunca tinha passado.** Duas causas: um `speak()` sem `lang` fazia `npm test` sair 1 com zero testes falhando, e o banco vazio abria o app no Onboarding, derrubando 20 de 26 e2e | Fase 0, tentando confirmar "CI verde" | tudo o mais dependia disso |
| **O log guardava o conteúdo do usuário.** O ORM anexa os valores vinculados a `message`, `stack` e `params`; o driver do libsql não faz isso. Toda escrita que falhava despejava texto de transcrição no diário, por dentro do único campo que a allowlist deixa passar | Fase 4, testando o que o `error` carrega | LGPD; 20+ pontos de log |
| **O `.apkg` exportado carregava marcação viva.** `limparCampo` decodifica entidades depois de tirar tags — de propósito —, então `&lt;script&gt;` sai como `<script>`. Inerte no produto, executável no webview do Anki de quem recebe o arquivo | Fase 4, com fixtures hostis | saía do nosso domínio |
| **`largerModels` não tinha leitor.** Estava na matriz de planos, ia para o cliente, e `grep largerModels server/` não achava um único uso | Fase 4 | o Pro pagava por uma diferença inexistente; o free usava o modelo caro |
| **Quatro escritas admin cross-tenant sem limitador**, e **401 sem teto nenhum** | Fase 4, matriz lida do `app._router.stack` | `requireRole` diz quem entra, não quantas vezes |
| **`GET /api/exercises/results` não tinha teto.** Com 198 linhas custava 37 ms; com 20 mil devolvia **3,85 MB por chamada**. E `?limite=` já era mandado e descartado em silêncio pelo `.strip()` | Fase 5, só sob carga | 1,1 GB → 46 MB; 2,9× de vazão |
| **`SIGTERM` matava escrita em curso**, e o cluster refazia worker durante o desligamento | Fase 5 | `grep` por `SIGTERM` devolvia zero |
| **`trust proxy` nunca configurado** | Fase 5 | atrás de proxy, todos dividem o mesmo balde |
| **17 ciclos de importação** criados pela divisão do funil | portão `morto:ciclos` | pego antes do merge |
| **Três portões teriam sido desligados em silêncio** pela árvore por domínio (globs de um nível só) | Fase 3, antes de mover | portão que passa sempre é pior que portão nenhum |

### Defeitos preexistentes encontrados e **não** consertados

- **`createSessionSchema` aceita 5.000 falas e o repositório estoura antes.** `db.batch()` único,
  `SQLITE_ERROR: too many SQL variables`. Medido: 1.500 passam, 2.000 respondem 400 "erro interno".
- **`GET /api/metrics/profile`**: 41,8 ms de CPU por chamada; os 371 ms do HTTP são fila.
- **CLS 0,51 em `/jogar`**, nos dois presets.
- **`buildRodadasEscuta`/`Ditado`/`Conectores` embaralham sem semente**: com mais falas que o teto do
  jogo, até o *conjunto* de itens varia entre duas montagens idênticas.
- **`minimo` com `exerciseKind === ''`**: o `&&` devolve string vazia, o `>=` a coage para 0, e
  qualquer rodada vira "perfeita".
- **`DELETE /api/ai/credentials/:id` sem consumidor na interface**: a pessoa não consegue apagar uma
  chave de API que colou.
- **Quatro desvios de forma de resposta** (dois `DELETE` confirmando exclusão que não aconteceu, um
  `200 []`, um 400 onde a rota irmã dá 404). Nenhum vaza dado nem tem efeito.

---

## 4. Sete diagnósticos anteriores que a medição corrigiu

A regra "não confie em relatório de IA anterior" pagou o custo dela sete vezes:

| dizia | media |
|---|---|
| "cálculo de seeds duplicado em 3 lugares" | os valores já tinham fonte única; o que se repetia era o **pareamento** XP↔Seeds — e o teste achou uma divergência real (a missão "capturar" promete o XP de salvar a sessão com os Seeds de cinco minutos gravados) |
| "15 cópias de `normalize('NFD')`" | são **três perguntas diferentes**; unificar quebraria a comparação de frases. Só uma delas estava duplicada, em quatro variantes |
| "60 leituras de env precisam de schema Zod" | as 60 já estavam no inventário; escapavam **duas** leituras montadas (`process.env[nome]`), invisíveis ao grep e à regra ao mesmo tempo |
| "16,2 % de duplicação de código" | 0,70 % de código real — o resto era snapshot de migração e JSON de i18n |
| "o cap mensal degrada aberto" | o teto responde 402 e vale sob concorrência; só a falha de **infra** degrada aberto, com política declarada e teste próprio |
| "`/api/import/anki` precisa entrar no `writeLimiter`" | já estava no `expensiveLimiter`, com teto mais **apertado** |
| "`/api/vocab` é lenta por falta de índice ou paginação" | `EXPLAIN` mostra índice em todas as consultas e o banco tem 2.783 cartões; o custo é o corpo, e **54 % dele são nomes de chave repetidos** |

---

## 5. Erros meus nesta rodada

Registrados porque a regra vale para mim também.

1. **Quebrei dois testes** ao tirar `difficultyAt` de `GET /api/vocab`: procurei leitores em `src/` e
   não no repositório. Um relatório paralelo os classificou como "já falhavam em HEAD" — verdade e
   enganoso: HEAD já era o meu commit.
2. **O teste de concorrência passou por vacuidade.** Banco inexistente, 40 respostas 400, saída
   "APROVADO: teto respeitado". Hoje zero gasto aceito reprova.
3. **A primeira corrida de carga mediu 400 de validação** e reportou "58,82 % de falha", que teria
   sido lido como saturação do servidor.
4. **Os limiares do k6 reprovavam sempre**, porque vinham de medição de rota isolada.
5. **Dois commits da Fase 4 foram feitos com três testes quebrados**: o prettier mudou a aspa de
   `app.ts` e as regexes que liam o arquivo como texto passaram a casar com zero.
6. **Inventei um SHA de imagem Docker** no job do semgrep. Substituído por versão fixada via `pipx`.
7. **A varredura final pegou a minha própria carga de teste**: o `AIzaSyA1234567890abcdef` do teste
   de redação. Allowlist por valor, com o motivo escrito.

E uma disciplina que só apareceu medindo: **cópia nova do banco a cada corrida de carga** — 108 req/s
numa cópia limpa contra 59 req/s no banco engordado pela corrida anterior.

---

## 6. O que ficou de fora, e por quê

| item | motivo |
|---|---|
| **movimentação por domínio dos 349 arquivos** | a medição mostrou que o problema não era onde os arquivos estavam: sete deles pertenciam a cinco domínios cada. Foram divididos primeiro. A árvore, o `mapa.csv` e a ordem estão prontos e aprovados, e os portões já sobrevivem a ela |
| **passada geral do Prettier** (1.111 arquivos) | por decisão, depois das movimentações — para o `.git-blame-ignore-revs` cobrir um commit só |
| **OpenTelemetry** | o que a fase entregou cobre a pergunta operacional sem preload no boot, e o arranque já piorou 400 ms sem ele |
| **`computeProfile`** | 41,8 ms medidos; reestruturá-la mexe na função que alimenta várias telas |
| **desempenho de cliente** (lazy por jogo, CLS de `/jogar`) | não foi feito |
| **job de carga no CI** | exige runner com banco semeado |
| **agregação de `/metrics` em cluster** | é um listener próprio no primário, uma linha em `server.ts` |
| **catraca de idioma de identificadores** | glossário não escrito |

---

## 7. Validação da imagem — e o defeito que ela revelou

`docker build` **falhava em `main` desde o primeiro commit público**, e ninguém sabia: o
`postinstall` do `package.json` chama `scripts/copiar-assets-runtime.mjs`, e o estágio de runtime
copia só `package.json` e `package-lock.json`. O `npm ci --omit=dev` morria com
`Cannot find module '/app/scripts/copiar-assets-runtime.mjs'`.

O número "847 MB (medido)" em `docs/deploy.md` é de um estado anterior do arquivo. **A validação
final é o primeiro `docker build` desta árvore.**

A correção é uma flag, e é a certa e não um remendo: aquele script copia binários de runtime **do
cliente** (ORT wasm + Silero VAD) para `public/`, e o estágio de build já o executa explicitamente
antes do `vite build` — eles chegam ao runtime dentro de `dist/`. O estágio de build usa
`--ignore-scripts` pela mesma razão.

Com a correção, verificado por execução:

| verificação | resultado |
|---|---|
| `docker build` | **ok**, imagem de 865 MB |
| `GET /api/health` | 200 |
| `GET /api/ready` | 200 — `{"status":"pronto","db":"up","migracoes":"aplicadas","boot":"ok","armazenamento":"nao-configurado"}` |
| `GET /metrics` com `METRICS_ENABLED=1` | 200 |
| `HEALTHCHECK` do Docker | `healthy` (apontando para `/api/ready`) |
| `docker stop` | **563 ms**, código de saída **0**, log: `[desligamento] SIGTERM: conexões drenadas em 0 ms; saindo com 0` |

O `docker stop` é a prova de ponta a ponta do desligamento gracioso: o container saiu em meio
segundo com código 0, e não nos 10 s do `SIGKILL` que o Docker aplicaria a um processo que ignora o
sinal — que era o comportamento antes desta rodada.

## 8. Estado da entrega

- **Branch**: `saneamento/2026-09-08`, 55 commits à frente de `main`, empurrada para `origin` em `8030e61`.
- **Bateria local, com a árvore quieta**: 3.901 testes vitest · 99 e2e em 3 viewports · `tsc` ·
  `typecheck:core` · `typecheck:estrito` · `eslint --max-warnings 0` · `knip` · `madge` ·
  `audit:gate` · `gitleaks` (0) · `ast-grep test` + `scan` · `rotas-sem-caracterizacao` (87) ·
  `rotas-sem-consumidor` (87) · `workflows:validar` · `build` · `k6` contra cópia limpa. **Todos exit
  0.**
- **PRs**: não abertas. O `gh` está instalado (2.100.0) e **não autenticado** nesta máquina
  (`gh auth status`: "not logged into any GitHub hosts"), e a autenticação exige uma sessão
  interativa. Os comandos prontos estão em §8.
- **Changes OpenSpec**: 32 arquivadas nesta rodada; 14 continuam abertas (as três paradas por
  decisão do dono, mais as de produto anteriores a esta rodada). `openspec validate --all` limpo, 91
  itens.

## 9. Para abrir as PRs

Uma por fase, como decidido:

```bash
gh auth login
git push origin saneamento/2026-09-08

gh pr create --base main --head saneamento/2026-09-08 \
  --title "Saneamento 2026-09 — seis fases, 31 changes" \
  --body-file openspec/audits/2026-09-09-saneamento-relatorio-final.md
```

Os relatórios por fase, para o corpo de PRs separadas, estão em `openspec/audits/`:
`2026-09-09-fase1-rede-de-seguranca.md`, `fase2-codigo-morto`, `fase3-estrutura-e-padrao`,
`fase4-seguranca`, `fase5-observabilidade-e-desempenho`.
