> **Revisão de 25/11/2026** (main `897c9d25`). Das 6 abertas (2.6b, 2.8, 2.9, 2.10, 4.7, 5.2), 4 foram relidas contra o desenho de hoje: o lobby do Jogar
> passou a usar a ficha de conteúdo (`FichaDoJogar.tsx`, seletor único com Cartões e Biblioteca) e `polimento-movimento` (bloco 2, "Jogar sem frustração")
> entregou níveis por jogo, ajudas e a ficha "Como se joga" na antessala e na pausa. `Play.tsx` cresceu de 2.611 para 4.037 linhas; `SalaDeEscolha`,
> `AntessalaDaRodada` e `PainelTrilha` ainda existem. **[D]** = depende do dono; **[R]** = navegador ou aparelho real. Toda tarefa aberta tem "Verificar:".
> Conflito principal: `Play.tsx` com `polimento-movimento` (fazer DEPOIS dele). O PR #202 zerou o bônus de velocidade (`BONUS_RAPIDO = 0`,
> `src/core/minigames/grade.ts`); não afeta estas tarefas, mas nenhum texto novo pode prometer bônus de velocidade.

> **Revisao de estado em 2026-09-08.** O `tasks.md` marcava 20 tarefas abertas e a medicao achou
> 14 ja feitas — o arquivo estava desatualizado, nao o codigo. As 6 que restam sao trabalho de UI
> (folha de detalhe, 2.6b/2.8/2.10), o checklist (2.9) e o bloqueio de `Intl.Segmenter` (4.7).

> **Estado em 2026-09-07** (auditoria `openspec/audits/2026-09-07-coerencia.md`): 20 tarefas abertas. Achados que decidem parte delas: A02 (9 jogos culturais fora do funil, anunciados como funcionais) em `jogos-culturais-dentro-do-sistema`; A14 (conquista Colecionador inalcancavel, item 1.7) em `seeds-e-creditos-fonte-unica`; A63 (`ResumoDaRodada` com nivel fixo, drop so via ver erros). A montagem da rodada esta descrita em `openspec/specs/rodada-e-fsrs/spec.md`.

## 1. Promessas quebradas (independentes entre si e do redesenho)

- [x] 1.1 F02 — o botão da Sala virou "Usar estas palavras", sem ícone de play: ele APLICA a
      escolha, e começar a rodada dali montaria com a fonte antiga (a nova só existe no render seguinte)
- [x] 1.2 F08 — "Trilha" sem nível não pode entregar zero itens
- [x] 1.3 F11 — na trilha, ou acertar conta na memória, ou a tela para de prometer que conta
- [x] 1.4 F10 — jogos de frase respeitam a fonte escolhida; remover a seção morta `Play.tsx:2188-2210`
- [x] 1.5 F45 — falha de rede deixa de aparecer como "Você ainda não salvou palavras"
- [x] 1.6 Restaurar a fonte guardada também para quem tem zero gravações (`Play.tsx:972-985`)
- [x] 1.7 F29 — a conquista "Colecionador" precisa ser alcançável, ou sair
- [x] 1.8 F30 — a explicação de moeda passa a ler a tabela viva (`xp.ts:61-69`), não texto fixo
- [x] 1.9 F34 — a chama de dias seguidos para de prometer que jogar a move
- [x] 1.10 F25 — o portão de áudio pergunta por voz **naquele idioma** (`hasVoiceFor`, `tts.ts:171`)
- [x] 1.11 F43/F44 — modais empilhados movem o foco; Esc no seletor não fecha a Sala inteira
- [x] 1.12 Remover o paginador inerte (`Play.tsx:2337-2359`, `POR_PAGINA=9` para 9 jogos)

## 2. A tela

- [x] 2.1 Abas de fonte + faixa de contexto por fonte (trilha como curso: etapa N de M)
- [x] 2.2 Inverter os defaults de `salaAberta` e `pularSempre` — a Sala abre só para quem ainda
      não escolheu (`temFonteGuardada`), e a prévia passa a ser opt-in pelo checkbox do lobby
- [x] 2.3 Modo "Organizar" da grade; reordenar e fixar saem da carta
- [x] 2.4 Grade com semântica de lista e um alvo por carta
- [x] 2.5 Bloqueio pela porta; descrição e motivo por fonte
- [x] 2.6a Prévia sem zeros — "já viu" e "para repetir" somem quando são zero; "novas" FICA
      mesmo em zero, porque zero ali é a denúncia de sorteio repetido que a tela existe para dar
- [ ] 2.6b Folha de detalhe (ficha + prévia), com fatos ≠ zero e passando por `previaSegura`.
      Nota 25/11: a ficha "Como se joga" e o nível por jogo já existem (`polimento-movimento` 2.2 e 2.5); falta
      unir a prévia da rodada (novas, já viu, para repetir) na mesma folha. Sem bônus de velocidade no texto (PR #202).
      Verificar: `npx vitest run tests/antessala.test.ts tests/antessala-fases.test.tsx` (nenhum jogo revela a
      resposta; jogo fora da tabela `REVELAVEL` lança) e teste de componente com prévia toda zerada (só "novas" aparece)
- [x] 2.7a Caminho para o passe/loja no cabeçalho da tela
- [x] 2.7b Raspadinha na jornada — ela era INALCANÇÁVEL: `verResumo` era ligado junto com o
      resultado e a cascata testa `resultado && verResumo` antes de `resultado`. O resumo virou
      uma porta da raspadinha ("Ver o que escapou"), oferecida só quando houve erro
- [ ] 2.8 Achar casa para o que a antessala fazia bem: chips de faixa/estratégia, rodada de resgate,
      mapa de fases, painel de progressão por jogo.
      Verificar: cada um dos quatro tem lugar escrito na tabela do checklist 2.9 (mantido, movido ou removido
      com motivo) e a rodada de resgate (`memoriaDeItens.ts`, 4º erro seguido) continua alcançável por teste
- [ ] 2.9 Checklist anti-regressão preenchido (C1–C23, S1–S9, A1–A12, R1–R5, U1–U4).
      Nota 25/11: refazer o inventário sobre o lobby de hoje (ficha de conteúdo no lugar do seletor antigo).
      Verificar: tabela em `docs/auditoria/` com os 5 grupos, cada controle com destino e motivo; e2e do Jogar
      em 1280, 768 e 375 verde
- [ ] 2.10 Fundir `PainelTrilha` na faixa de contexto — hoje os dois falam de etapa e nível, e
      pôr chips na faixa criou um segundo seletor. O painel tem a informação melhor (% por nível,
      "AQUI" no sugerido, mapa de etapas); a faixa tem o resumo de uma linha sempre visível.
      Um dos dois some, e o que sobrar herda o que o outro fazia bem.
      Nota 25/11: `PainelTrilha` segue em `Play.tsx` (2 usos) e em `LobbyDoQuest.tsx`; a "faixa de contexto" virou a
      ficha de conteúdo, então reler a tarefa contra ela antes de escolher quem some. **[D]** (qual dos dois fica).
      Verificar: um só componente mostra etapa, nível e % por nível; e2e do Jogar com a Trilha em 1280 e 375

## 3. Artes

- [x] 3.1 Sistema de cor por família + legenda de três palavras
- [x] 3.2 Redesenhar as 9 artes: silhueta distinta, nada desenhado sobre o fundo
- [x] 3.3 Uma metáfora por carta (o ícone pixel sai da grade)
- [x] 3.4 Conferir as 9 artes nos 7 temas, claro e escuro

## 4. Trilhas em outros idiomas

- [x] 4.1 Versionar o script de geração (hoje só a saída é versionada, `FONTES.md:178-188`) > Os 9 scripts de `scripts/trilha/` estao versionados e `package.json` expoe dois > deles. O que estava errado era o `FONTES.md`, que afirmava o contrario.
- [x] 4.2 Carga sob demanda da trilha (3 rotas puxam `en.json` hoje)
- [x] 4.3 Idioma nativo na estrutura da trilha
- [x] 4.4 Faixas por frequência, rotuladas como tal, ao lado do CEFR do inglês
- [x] 4.5 Espanhol e Francês, com cobertura medida e atribuição de licença antes de publicar
- [x] 4.6 Alemão e Italiano (rever o teto de 8 letras do Termo, `termo.ts:122-123`)
- [ ] 4.7 Japonês/Chinês/Coreano. Nota 25/11: o bloqueio de `Intl.Segmenter` caiu (`src/core/texto/segmentacao.ts`
      segmenta ja, zh e th; changes arquivadas `exercicios-de-frase`, `escrita-do-chines`, `jogo-pares-minimos`).
      Sobra o gate `escrita-sem-separacao` em `src/core/minigames/desbloqueio.ts` e o teclado por script (5.2).
      Verificar: `npx vitest run tests/desbloqueio.test.ts tests/desbloqueios.test.ts` com ja e zh sem o motivo
      `escrita-sem-separacao`; coreano segue bloqueado com motivo dito; navegador real para voz sintetizada e
      teclado do Quest **[R]**

## 5. Rodada mista

- [x] 5.1 `normalizarPalavra` Unicode + alfabeto por script (`wordsearch.ts:55-57,111`) > Latim estendido, nao alfabeto por script: `ja/zh/ko` continuam fora, e o gate > `alfabeto: 'latino'` continua sendo quem os recusa.
- [ ] 5.2 Teclado do Termo por idioma (hoje `LINHAS_DO_TECLADO` QWERTY fixo em
      `src/components/minigames/TermoDoPrototipo.tsx:53`; a referência `TermoGame.tsx` é velha).
      Verificar: teste do teclado com es (ñ), de (ä ö ü ß) e pt (ç): a palavra do dia de cada idioma é
      digitável só pela tela > PARCIAL (08/09): o teclado continua QWERTY fixo. O que foi feito foi o dano > adjacente e maior: `l`-cortado, `o`-cortado e as ligaduras SUMIAM da chave de > comparacao em vez de virar a base (`latwy` comparava como ATWY), o que tirava 17% > da trilha polonesa. Ver `comBaseLatina`. O teclado por idioma continua aberto.
- [x] 5.3 TTS pelo idioma do item, sem cair em `en-US` (`tts.ts:237`)
- [x] 5.4 `MinigameItem.lang` deixa de ser campo morto nos 4 jogos de palavra
- [x] 5.5 Distratores do Duelo não podem vazar a resposta pelo idioma (`itemSource.ts:230`)
- [x] 5.6 Conectores e régua gramatical para além de en/pt/es (`escuta.ts:204-224`, `quality.ts:72-112`)
