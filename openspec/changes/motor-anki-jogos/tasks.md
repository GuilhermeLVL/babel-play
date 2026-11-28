> **Revisão de 25/11/2026** (main `897c9d25`, depois dos PRs #201, #202, #205 e #206). Legenda: **[D]** = decisão ou ato do dono;
> **[R]** = aparelho real. As notas "Feito:" apontam o arquivo que prova. O que ficou velho e o motivo estão em `proposal.md`
> (seção "Revisão de 25/11/2026"). Em toda tarefa: `npm run typecheck`, `npm run lint` e só os testes dos arquivos tocados.

## 1. Filtro por baralho (o mecanismo já existe)

- [x] 1.1 Ramo `origin_kind='anki' AND origin_ref=<deckId>` em `selecionarParaJogo`. Feito: `server/db/repositories/vocab.ts`.
- [x] 1.2 `PedidoDeComposicao.fonte.ref` carrega o baralho. Feito: `src/core/minigames/composicao.ts`.
- [x] 1.3 Payload do deck leva cartão→baralho (`VocabCard.baralhosAnki`). Feito: `src/types.ts`, `src/data/rotas/vocabulario.ts`.
- [x] 1.4 Dizer na tela quando o filtro por baralho não pôde ser aplicado. A função pura `filtroAplicavel`
      (`src/core/minigames/filtro.ts:149`) e o teste (`tests/filtroDaPratica.test.ts:120`) existem, mas nenhum componente a chama.
      Ligar no lobby de `Play.tsx` (aviso com o `motivo`; sem aviso quando `aplicavel` é `true`).
      Verificar: teste de componente com cartões sem `baralhosAnki` e baralho escolhido mostra o aviso, e a rodada não esvazia em silêncio.
      Feito (decisão assumida: recomendação a, 25/11): aviso `aviso-filtro-baralho` no lobby de `Play.tsx` via `filtroAplicavel`. Falta teste de componente do lobby (Play é pesado demais para montar); a função pura segue coberta em `tests/filtroDaPratica.test.ts`.
- [x] 1.5 Seletor de baralho no lobby. Feito: chip de baralho (`filtro.ts`, estado `filtroDaSessao` em `Play.tsx`).
- [x] 1.6 Escolher baralho recorta; sem escolha, acervo inteiro. Feito: `tests/filtroDaPratica.test.ts`, `tests/e2e/baralhos.e2e.ts`.

## 2. Matriz jogo × dados

- [x] 2.1 Conferir a matriz do `design.md` contra `estadoDeCadaJogo` (`src/core/minigames/estadoDosJogos.ts`), que já decide
      elegibilidade por jogo (spec vigente `openspec/specs/elegibilidade-por-jogo/`). Só criar `elegibilidadePorJogo(item)` se faltar
      a decisão POR ITEM (hoje é por conjunto).
      Verificar: tabela linha a linha (jogo × campo ausente) no PR, cada linha apontando a função que a cobre; nenhuma regra duplicada de `MINIGAMES`/`REVELAVEL`.

      **Feito 27/11 (restos/anki):** matriz conferida linha a linha contra `estadoDeCadaJogo`; a decisão por item não faltava (o gate é por conjunto e a regra por item já mora em `canPlay`/`promptFor`/`buildItems`), então `elegibilidadePorJogo(item)` NÃO foi criada. Cada linha e quem a decide: memória = `requiresTranslation` + `canPlay`; caça-palavras = `requisitos.alfabeto` (`alfabeto-nao-suportado`) + pista sem lacuna; duelo = `promptFor` (tradução ou frase com lacuna); termo = `contarJogaveisMulti` + alfabeto; embaralhar = `buildScrambleRounds` (frase de 4 a 10 palavras COM tradução; a frase do acervo do Anki vem sem tradução, então só abre quando a frase tem uma); escuta e ditado = `buildRodadasEscuta/Ditado` por TTS (`falasSoDoAcervo` + `temVoz`); karaokê = `sem-clipe-de-audio`; conectores = `temConectores(lang)`. Lacuna achada: a matriz diz "idioma sem lista de conectores → indisponível", e o gate fecha o jogo mas SEM motivo próprio (cai em "Precisa de N frases"); não criei motivo novo porque `Play.tsx`/`LobbyDoQuest.tsx` tratam "sem motivo" como "faltam N, ofereça o catálogo". Prova: `tests/matriz-anki-nos-jogos.test.ts`.

- [x] 2.2 Motivo de indisponibilidade quando o baralho escolhido não serve ao jogo, pelo gate existente (`sem-voz`, `trilha-sem-frase`).
      Verificar: com um baralho sem frases, os cinco jogos de frase mostram o motivo (teste de `estadoDeCadaJogo` com a fonte do baralho).

      **Feito 27/11 (restos/anki):** o gate já nomeava `sem-clipe-de-audio` (karaokê) e `alfabeto-nao-suportado`; faltava `sem-voz` para a frase do baralho sem voz (escuta e ditado ficavam sem motivo): corrigido em `estadoDosJogos.ts`. Baralho SEM frases: os cinco jogos de frase ficam fechados com `fonte:'falas'`, `disponiveis:0` e `faltam`, e a tela diz "Precisa de N frases; aqui há 0" (a contagem é o motivo; `trilha-sem-frase` é da Trilha e a mensagem dele diria "a Trilha não tem"). Provas no mesmo arquivo da matriz.

- [x] 2.3 Alfabeto não latino: caça-palavras e termo indisponíveis com motivo. Feito: `requisitos.alfabeto: 'latino'` em
      `estadoDosJogos.ts:383` e `:446`.
- [x] 2.4 Teste tabular da matriz, um caso por linha.
      Verificar: `npx vitest run <arquivo>` com 9 jogos × (completo, sem tradução, sem frase, script não latino), todos verdes.

      **Feito 27/11 (restos/anki):** `tests/matriz-anki-nos-jogos.test.ts`, as 9 linhas da matriz × 4 cenários do baralho (completo, sem tradução, sem frase, escrita não latina; o último em russo, que tem espaço e deixa o gate falar), 36 casos mais os de motivo.

## 3. Frase do baralho vira fala

- [x] 3.1 Nota com frase vira fala sem clipe (`startMs:0,endMs:0`, fala por TTS). Feito: `frasesDoAcervo`
      (`src/core/minigames/source.ts:335`, commit `0e62f9a9`), consumida em `rodada.ts:282` só quando não há fala gravada.
- [x] ~~3.1b Áudio nativo do baralho~~ **Removido do escopo** (25/11): a mídia do `.apkg` foi cancelada
      (`openspec/changes/archive/2026-09-08-motor-anki-midia-cancelada/`) e a importação pesada roda no navegador; o servidor não guarda o áudio.
- [x] 3.2 Karaokê indisponível para frase do baralho (precisa de clipe real); escuta e ditado aceitam TTS. Hoje `rodada.ts:565` exige `temAudio`.
      Verificar: teste de rodada com só `frasesDoAcervo`: escuta e ditado montam, karaokê devolve `null` com motivo dito na tela.
      Feito: `falasAudiveis` aceita `0/0` (TTS), gate com motivo `sem-clipe-de-audio`. Teste: `tests/baralhoNosJogos.test.ts`.
- [x] 3.3 Baralho com frases alimenta os 5 jogos de frase conforme a matriz.
      Verificar: teste de `montarRodada` por jogo com baralho de 20 frases (≥ 4 palavras) e outro sem tradução.
      Feito para escuta, ditado e karaokê (`tests/baralhoNosJogos.test.ts`); scramble/conectores já liam `frasesDoAcervo`, sem teste novo.

## 4. Origem visível e progresso

- [x] 4.1 Chip "Anki · nome do baralho" na PRÉVIA, dentro do funil `previaSegura`. Atenção: `origemDoMaterial`
      (`revelavel.ts:149`) devolve `'sessao'` para jogo de fala vindo do baralho, o que rotula errado a frase do acervo; corrigir junto.
      Verificar: teste da prévia de escuta com frase do acervo mostra "Anki · <nome>" e não "sessão".
      Feito: `origemDoMaterial` devolve `baralho` para frase do acervo; rótulo "Anki · nome" na prévia (`AntessalaDaRodada.tsx`).
- [x] 4.2 Anti-spoiler: a origem respeita `REVELAVEL`.
      Verificar: teste existente de `revelavel` segue verde e um caso novo (Termo, Ditado) prova que o nome do baralho não revela a resposta.
      Feito: nome do baralho passa por `previaSegura`; caso em `tests/baralhoNosJogos.test.ts` (Ditado).
- [x] 4.3 Modo "só revisão" para item que não serve a nenhum jogo (grava memória, sem mecânica).
      Verificar: item sem tradução e sem frase aparece na revisão simples e atualiza a memória (teste do repositório e de componente).
      Feito (decisão assumida: recomendação a, agora, 25/11): `src/core/minigames/soRevisao.ts` + `RevisaoSimples.tsx`, oferta no lobby sem menu novo; nota via `reviewCard` (origem `revisao`, formato `lembrar`). Testes: `tests/revisaoSimples.test.tsx`, `tests/baralhoNosJogos.test.ts`.
- [x] 4.4 Progresso por baralho na tela do baralho.
      Verificar: teste do payload `praticado/total` por `deckId` e e2e que abre a tela e lê o número.

      **Feito 27/11 (restos/anki):** `GET /api/anki/decks` devolve `praticadas` por baralho (nota cujo cartão projetado tem `reps > 0`; ativar não é praticar) e `BaralhosAnki.tsx` mostra "N de M notas já praticadas" (`data-testid="baralho-praticadas"`). Provas: `tests/integration/anki-progresso-por-baralho.test.ts` (payload por `deckId`, outra conta não entra), `tests/baralhosAnki.test.tsx` e `tests/e2e/baralhos.e2e.ts` (abre a tela e lê o número).

## 5. Validação de ponta a ponta

- [x] 5.1 Importar, ativar, jogar filtrado, remover. Feito: `tests/e2e/baralhos.e2e.ts` com `semearBaralhoAnki`.
- [x] 5.2 Suíte Playwright do repositório. Feito: `playwright.config.ts` e dezenas de arquivos em `tests/e2e/` (tarefa original superada).
- [x] 5.3 Gates verdes na entrega original; repetir em cada PR de fatia.
- [x] ~~5.4 Jogo novo (memória palavra↔imagem, cloze race)~~ **Descartado**: imagem e áudio do `.apkg` não chegam ao servidor; jogo que funciona em 2% do acervo é mobiliário.
