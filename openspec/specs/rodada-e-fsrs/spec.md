# rodada-e-fsrs Specification

## Purpose
Descreve como uma rodada de jogo e montada, jogada e registrada HOJE. Ponto central, contra o que documentos anteriores assumiam: a rodada e montada NO CLIENTE (`montarRodada` e uma closure do componente `Play`); o servidor ordena e corta o pool e e a unica autoridade do agendador FSRS. Escrita a partir do codigo em 2026-09-07 (auditoria, secao 2.4); cada requirement cita o `arquivo:linha` que o implementa.

## Requirements

### Requirement: O servidor compoe o pool, o cliente monta a rodada
`compor` (`src/core/minigames/composicao.ts:436`, chamado em `src/components/views/Play.tsx:1619`) SHALL pedir o pool a `GET /api/vocab/para-jogo` — ou `POST` com o mesmo corpo quando a query passa de `TETO_DA_QUERY_DA_COMPOSICAO` (`composicao.ts:376,391`) — servido por `paraJogo` (`server/routes/vocab.ts:22-50`) sobre `vocabRepo.selecionarParaJogo` (`server/db/repositories/vocab.ts:522`). O filtro facetado viaja no pedido e tem precedencia sobre `fonte/fonteRef/lang` (`vocab.ts:557-563`). Sem rede ou com resposta malformada, `composicaoLocal` (`composicao.ts:286`) compoe no cliente com a origem marcada `fallback-local`.

#### Scenario: Filtro por baralho
- **WHEN** a pessoa escolhe um baralho Anki e pede uma rodada
- **THEN** o pedido leva `filtro` com `fontes`, `baralhos` e `idiomas`, e cada item devolvido tem ocorrencia naquele baralho (`tests/integration/filtro-composicao.test.ts`)

#### Scenario: Rede caida
- **WHEN** `fetch` lanca ou devolve 500
- **THEN** a composicao e local, `origemDaComposicao` e `fallback-local` e a rodada nunca sai vazia (`tests/composicaoDeRodada.test.ts`)

### Requirement: O recorte final e o mesmo para todos os jogos
`jogaveis` (`src/components/views/Play.tsx:1816-1849`) SHALL ser o unico recorte usado pelas cartas, pelo inicio da rodada e pela curadoria: `recortarPelaComposicao` (`src/core/minigames/composicao.ts:506`) aplica a ordem do servidor sobre os cartoes ja triados. Cada um dos 9 jogos classicos (`MinigameId`, `src/core/minigames/types.ts:16`) declara em `MINIGAMES` (`types.ts:141`) minimo, maximo, se exige traducao e se escreve no SRS (`writesSrs`, `types.ts:97`); `estadoDeCadaJogo` (`src/core/minigames/estadoDosJogos.ts:354`, usado em `Play.tsx`) decide o que esta jogavel e por que nao.

#### Scenario: Jogo sem material
- **WHEN** o recorte tem menos itens que `minItems` do jogo
- **THEN** o jogo aparece bloqueado com o motivo, nao com grade vazia

### Requirement: A rodada e montada no cliente
`montarRodada` (`src/components/views/Play.tsx:720`) SHALL devolver `{ jogo, previa, aplicar }` para os 8 ramos de jogo; `pedirParaJogar` (`Play.tsx:1006`) passa pela antessala (`previaSegura`) ou comeca direto, e `aplicar()` entrega os itens ao componente. Nao existe montagem de rodada no servidor.

#### Scenario: Pedir Termo
- **WHEN** a pessoa pede o jogo `termo`
- **THEN** o ramo de `montarRodada` usa o builder proprio (`src/core/minigames/termo.ts`) sobre `jogaveis` e nenhuma requisicao extra e feita

### Requirement: Um funil so registra o fim da rodada
`aoTerminar` (`src/components/views/Play.tsx:1128`) SHALL ser o unico destino do `onFinish` dos 9 classicos e, nesta ordem: pontuar (`pontuarRodada`, `src/core/minigames/grade.ts:125`), enviar a nota FSRS por item que tem `cardId` e cujo jogo tem `writesSrs` (`Play.tsx:1211-1212` → `reviewCard`, `src/data/api.ts:604` → `POST /api/vocab/:id/review`, `server/routes/vocab.ts:151` → `vocabRepo.review`, `server/db/repositories/vocab.ts:712`), e gravar a rodada (`Play.tsx:1216` → `salvarRodada`, `src/data/api.ts:696` → `POST /api/exercises/rodada`, `server/routes/exercises.ts:52` → `addRodada`, `server/db/repositories/exerciseResults.ts:284`). O item leva `kind: 'srs' | 'drill'` (`Play.tsx:1205`); so `drill` conta XP no perfil (`server/db/repositories/metrics.ts:125-129`).

#### Scenario: Jogo de frase
- **WHEN** a rodada e de `scramble`, `karaoke`, `escuta`, `ditado` ou `conectores`
- **THEN** nenhum `review` e enviado (`writesSrs: false`) e todos os itens sao `drill`

#### Scenario: Lacuna conhecida — jogos culturais fora do funil
- **WHEN** um dos 9 jogos de `JOGOS_CULTURAIS` (`Play.tsx:223`) termina
- **THEN** `fecharJogoCultural` (`Play.tsx:2589`) descarta o `RoundReport`: nada em `exercise_results`, `review_logs`, XP ou ranking (achado A02; change `jogos-culturais-dentro-do-sistema`)

### Requirement: O agendador e FSRS-5 e vive no servidor
A unica implementacao do agendador SHALL ser `src/core/learning/scheduler.ts:65-157` (FSRS-5, pesos default); a nota vem de `gradeFor` (`src/core/minigames/grade.ts:25`), o cliente nunca calcula intervalo. O servidor aplica em `vocabRepo.review` e grava `vocab_cards` + `review_logs`; o servidor efemero aplica a mesma funcao sobre IndexedDB no modo anonimo (`src/data/efemero/servidor.ts`).

#### Scenario: Nota fora do dominio
- **WHEN** `POST /api/vocab/:id/review` recebe `grade` fora de 1..4
- **THEN** o schema recusa com 400 antes de tocar o agendador (`server/routes/vocab.ts:151-155`)
