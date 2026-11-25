> **Revisão de 25/11/2026** (main `897c9d25`, depois dos PRs #201, #202, #205 e #206). Legenda: **[D]** = decisão ou ato do dono;
> **[R]** = aparelho real. As notas "Feito:" apontam o arquivo que prova. O que ficou velho e o motivo estão em `proposal.md`
> (seção "Revisão de 25/11/2026"). Em toda tarefa: `npm run typecheck`, `npm run lint` e só os testes dos arquivos tocados.

## 1. Filtro por baralho (o mecanismo já existe)

- [x] 1.1 Ramo `origin_kind='anki' AND origin_ref=<deckId>` em `selecionarParaJogo`. Feito: `server/db/repositories/vocab.ts`.
- [x] 1.2 `PedidoDeComposicao.fonte.ref` carrega o baralho. Feito: `src/core/minigames/composicao.ts`.
- [x] 1.3 Payload do deck leva cartão→baralho (`VocabCard.baralhosAnki`). Feito: `src/types.ts`, `src/data/rotas/vocabulario.ts`.
- [ ] 1.4 Dizer na tela quando o filtro por baralho não pôde ser aplicado. A função pura `filtroAplicavel`
      (`src/core/minigames/filtro.ts:149`) e o teste (`tests/filtroDaPratica.test.ts:120`) existem, mas nenhum componente a chama.
      Ligar no lobby de `Play.tsx` (aviso com o `motivo`; sem aviso quando `aplicavel` é `true`).
      Verificar: teste de componente com cartões sem `baralhosAnki` e baralho escolhido mostra o aviso, e a rodada não esvazia em silêncio.
- [x] 1.5 Seletor de baralho no lobby. Feito: chip de baralho (`filtro.ts`, estado `filtroDaSessao` em `Play.tsx`).
- [x] 1.6 Escolher baralho recorta; sem escolha, acervo inteiro. Feito: `tests/filtroDaPratica.test.ts`, `tests/e2e/baralhos.e2e.ts`.

## 2. Matriz jogo × dados

- [ ] 2.1 Conferir a matriz do `design.md` contra `estadoDeCadaJogo` (`src/core/minigames/estadoDosJogos.ts`), que já decide
      elegibilidade por jogo (spec vigente `openspec/specs/elegibilidade-por-jogo/`). Só criar `elegibilidadePorJogo(item)` se faltar
      a decisão POR ITEM (hoje é por conjunto).
      Verificar: tabela linha a linha (jogo × campo ausente) no PR, cada linha apontando a função que a cobre; nenhuma regra duplicada de `MINIGAMES`/`REVELAVEL`.
- [ ] 2.2 Motivo de indisponibilidade quando o baralho escolhido não serve ao jogo, pelo gate existente (`sem-voz`, `trilha-sem-frase`).
      Verificar: com um baralho sem frases, os cinco jogos de frase mostram o motivo (teste de `estadoDeCadaJogo` com a fonte do baralho).
- [x] 2.3 Alfabeto não latino: caça-palavras e termo indisponíveis com motivo. Feito: `requisitos.alfabeto: 'latino'` em
      `estadoDosJogos.ts:383` e `:446`.
- [ ] 2.4 Teste tabular da matriz, um caso por linha.
      Verificar: `npx vitest run <arquivo>` com 9 jogos × (completo, sem tradução, sem frase, script não latino), todos verdes.

## 3. Frase do baralho vira fala

- [x] 3.1 Nota com frase vira fala sem clipe (`startMs:0,endMs:0`, fala por TTS). Feito: `frasesDoAcervo`
      (`src/core/minigames/source.ts:335`, commit `0e62f9a9`), consumida em `rodada.ts:282` só quando não há fala gravada.
- [x] ~~3.1b Áudio nativo do baralho~~ **Removido do escopo** (25/11): a mídia do `.apkg` foi cancelada
      (`openspec/changes/archive/2026-09-08-motor-anki-midia-cancelada/`) e a importação pesada roda no navegador; o servidor não guarda o áudio.
- [ ] 3.2 Karaokê indisponível para frase do baralho (precisa de clipe real); escuta e ditado aceitam TTS. Hoje `rodada.ts:565` exige `temAudio`.
      Verificar: teste de rodada com só `frasesDoAcervo`: escuta e ditado montam, karaokê devolve `null` com motivo dito na tela.
- [ ] 3.3 Baralho com frases alimenta os 5 jogos de frase conforme a matriz.
      Verificar: teste de `montarRodada` por jogo com baralho de 20 frases (≥ 4 palavras) e outro sem tradução.

## 4. Origem visível e progresso

- [ ] 4.1 Chip "Anki · nome do baralho" na PRÉVIA, dentro do funil `previaSegura`. Atenção: `origemDoMaterial`
      (`revelavel.ts:149`) devolve `'sessao'` para jogo de fala vindo do baralho, o que rotula errado a frase do acervo; corrigir junto.
      Verificar: teste da prévia de escuta com frase do acervo mostra "Anki · <nome>" e não "sessão".
- [ ] 4.2 Anti-spoiler: a origem respeita `REVELAVEL`.
      Verificar: teste existente de `revelavel` segue verde e um caso novo (Termo, Ditado) prova que o nome do baralho não revela a resposta.
- [ ] 4.3 Modo "só revisão" para item que não serve a nenhum jogo (grava memória, sem mecânica).
      Verificar: item sem tradução e sem frase aparece na revisão simples e atualiza a memória (teste do repositório e de componente).
- [ ] 4.4 Progresso por baralho na tela do baralho.
      Verificar: teste do payload `praticado/total` por `deckId` e e2e que abre a tela e lê o número.

## 5. Validação de ponta a ponta

- [x] 5.1 Importar, ativar, jogar filtrado, remover. Feito: `tests/e2e/baralhos.e2e.ts` com `semearBaralhoAnki`.
- [x] 5.2 Suíte Playwright do repositório. Feito: `playwright.config.ts` e dezenas de arquivos em `tests/e2e/` (tarefa original superada).
- [x] 5.3 Gates verdes na entrega original; repetir em cada PR de fatia.
- [x] ~~5.4 Jogo novo (memória palavra↔imagem, cloze race)~~ **Descartado**: imagem e áudio do `.apkg` não chegam ao servidor; jogo que funciona em 2% do acervo é mobiliário.
