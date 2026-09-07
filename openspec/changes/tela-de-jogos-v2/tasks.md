> **Estado em 2026-09-07** (auditoria `openspec/audits/2026-09-07-coerencia.md`): 20 tarefas abertas. Achados que decidem parte delas: A02 (9 jogos culturais fora do funil, anunciados como funcionais) em `jogos-culturais-dentro-do-sistema`; A14 (conquista Colecionador inalcancavel, item 1.7) em `seeds-e-creditos-fonte-unica`; A63 (`ResumoDaRodada` com nivel fixo, drop so via ver erros). A montagem da rodada esta descrita em `openspec/specs/rodada-e-fsrs/spec.md`.

## 1. Promessas quebradas (independentes entre si e do redesenho)

- [x] 1.1 F02 — o botão da Sala virou "Usar estas palavras", sem ícone de play: ele APLICA a
      escolha, e começar a rodada dali montaria com a fonte antiga (a nova só existe no render seguinte)
- [x] 1.2 F08 — "Trilha" sem nível não pode entregar zero itens
- [ ] 1.3 F11 — na trilha, ou acertar conta na memória, ou a tela para de prometer que conta
- [x] 1.4 F10 — jogos de frase respeitam a fonte escolhida; remover a seção morta `Play.tsx:2188-2210`
- [x] 1.5 F45 — falha de rede deixa de aparecer como "Você ainda não salvou palavras"
- [x] 1.6 Restaurar a fonte guardada também para quem tem zero gravações (`Play.tsx:972-985`)
- [ ] 1.7 F29 — a conquista "Colecionador" precisa ser alcançável, ou sair
- [x] 1.8 F30 — a explicação de moeda passa a ler a tabela viva (`xp.ts:61-69`), não texto fixo
- [x] 1.9 F34 — a chama de dias seguidos para de prometer que jogar a move
- [x] 1.10 F25 — o portão de áudio pergunta por voz **naquele idioma** (`hasVoiceFor`, `tts.ts:171`)
- [ ] 1.11 F43/F44 — modais empilhados movem o foco; Esc no seletor não fecha a Sala inteira
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
- [ ] 2.6b Folha de detalhe (ficha + prévia), com fatos ≠ zero e passando por `previaSegura`
- [x] 2.7a Caminho para o passe/loja no cabeçalho da tela
- [x] 2.7b Raspadinha na jornada — ela era INALCANÇÁVEL: `verResumo` era ligado junto com o
      resultado e a cascata testa `resultado && verResumo` antes de `resultado`. O resumo virou
      uma porta da raspadinha ("Ver o que escapou"), oferecida só quando houve erro
- [ ] 2.8 Achar casa para o que a antessala fazia bem: chips de faixa/estratégia, rodada de resgate,
      mapa de fases, painel de progressão por jogo
- [ ] 2.9 Checklist anti-regressão preenchido (C1–C23, S1–S9, A1–A12, R1–R5, U1–U4)
- [ ] 2.10 Fundir `PainelTrilha` na faixa de contexto — hoje os dois falam de etapa e nível, e
      pôr chips na faixa criou um segundo seletor. O painel tem a informação melhor (% por nível,
      "AQUI" no sugerido, mapa de etapas); a faixa tem o resumo de uma linha sempre visível.
      Um dos dois some, e o que sobrar herda o que o outro fazia bem

## 3. Artes

- [x] 3.1 Sistema de cor por família + legenda de três palavras
- [x] 3.2 Redesenhar as 9 artes: silhueta distinta, nada desenhado sobre o fundo
- [x] 3.3 Uma metáfora por carta (o ícone pixel sai da grade)
- [x] 3.4 Conferir as 9 artes nos 7 temas, claro e escuro

## 4. Trilhas em outros idiomas

- [ ] 4.1 Versionar o script de geração (hoje só a saída é versionada, `FONTES.md:178-188`)
- [ ] 4.2 Carga sob demanda da trilha (3 rotas puxam `en.json` hoje)
- [ ] 4.3 Idioma nativo na estrutura da trilha
- [ ] 4.4 Faixas por frequência, rotuladas como tal, ao lado do CEFR do inglês
- [ ] 4.5 Espanhol e Francês, com cobertura medida e atribuição de licença antes de publicar
- [ ] 4.6 Alemão e Italiano (rever o teto de 8 letras do Termo, `termo.ts:122-123`)
- [ ] 4.7 Japonês/Chinês/Coreano — **bloqueado** até `Intl.Segmenter` e teclado por script

## 5. Rodada mista

- [ ] 5.1 `normalizarPalavra` Unicode + alfabeto por script (`wordsearch.ts:55-57,111`)
- [ ] 5.2 Teclado do Termo por idioma (`TermoGame.tsx:42,392`)
- [ ] 5.3 TTS pelo idioma do item, sem cair em `en-US` (`tts.ts:237`)
- [ ] 5.4 `MinigameItem.lang` deixa de ser campo morto nos 4 jogos de palavra
- [ ] 5.5 Distratores do Duelo não podem vazar a resposta pelo idioma (`itemSource.ts:230`)
- [ ] 5.6 Conectores e régua gramatical para além de en/pt/es (`escuta.ts:204-224`, `quality.ts:72-112`)
