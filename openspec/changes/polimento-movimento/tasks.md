# Tarefas

Fonte de cada item: o painel "Auditoria" de `docs/prototipos/polimento-movimento.html` (rodadas 1 a 16).

## 0. Fundação

- [x] 0.1 Curvas e física: `src/lib/movimento/mola.ts` (`curvaDeMola`, `MOLA`, `MOLA_SUAVE`,
      `projetar`, `elastico`, `velocidadeDoGesto`)
- [x] 0.2 Onde o movimento rico vale e a porta para animar: `src/lib/movimento/animar.ts`
      (`movimentoRico`, `instalarMarcaDeMovimento`, `animar`, `pararAnimacoes`)
- [x] 0.3 Tokens no CSS: `src/styles/questMovimento.css`, carregado com o trilho
- [x] 0.4 Inclinação do aparelho (giroscópio, com o ponteiro no computador):
      `src/lib/dispositivo/inclinacao.ts`
- [x] 0.5 Tato no celular, com chave própria (`babel.vibracao`): `src/lib/dispositivo/tato.ts`
- [x] 0.6 Testes: `tests/movimento.test.ts`, `tests/inclinacaoETato.test.ts`
- [x] 0.7 `docs/design/quest-desenho.md`: as duas faixas de movimento

## 1. A casca se mexe

- [x] 1.1 Toque: o botão afunda e volta com mola (`.q-tile`, `.q-ctl`, `.q-botao`, `.q-item`); o afundar
      continua o de `quest.css`, só a volta ganha a mola (`questMovimento.css`)
- [x] 1.2 Abas: a pílula desliza de uma aba para a outra (`.q-abas`): `src/lib/movimento/pilulaDasAbas.ts`,
      instalada com o trilho; conferida no app rodando (Jogar, desenho novo no computador)
- [x] 1.3 Troca de tela: a que entra sobe em cascata na primeira visita
      (`src/lib/movimento/entradaDasTelas.ts`). A SAÍDA da tela anterior fica de fora: as telas trocam
      por desmontar e montar, e segurar a desmontagem pede mexer em `useNavegacao`; avaliar depois
- [x] 1.4 Painel "Mais": nasce do botão que o abriu (`src/lib/movimento/nascerDoToque.ts`). Seguir o dedo
      e fechar por arremesso são da folha de baixo do celular: ficam com a fase 7
- [x] 1.5 Diálogos: nascem do ponto tocado, pelo mesmo instalador (`<dialog>`, `role="dialog"`). A saída
      animada e a folha de baixo ficam com a fase 7
- [x] 1.6 Aviso (toast): arrasta para fora e volta com mola; o tempo para com o dedo em cima
      (`src/lib/movimento/useArrastarParaFora.ts`, usado em `Toast.tsx`)
- [x] 1.7 Tema claro/escuro: a cor nova se abre em círculo a partir do toque
      (`src/lib/movimento/revelar.ts`, usado em `useAparencia.ts`). Trocar de TEMA (equipar) ainda troca
      na hora: `setTheme` é chamado de lugares onde `flushSync` não pode
- [x] 1.8 Tato nos toques: o som delegado (`src/lib/sfxDelegate.ts`) também vibra, pela mesma dedução;
      interruptor "Vibração" em Ajustes → Aparência, só onde o aparelho vibra; a chave cala também a
      vibração dos efeitos de jogo (`juice.ts`). O som dos toques já existia. No desenho novo o
      interruptor entra com a fase 7 (hoje ele não roda em aparelho que vibra pela página)
- [x] 1.9 O que abre pelo teclado não anima: uma tecla apaga o toque guardado (`nascerDoToque.ts`)
- [ ] 1.10 Testes de `questCasca` e os e2e de fumaça atualizados

## 2. Jogar sem frustração

- [x] 2.1 Tabela de regras por jogo e por nível: `src/core/minigames/regras.ts` (tempo, vidas, tempo à
      vista, ajudas), lida por dez jogos; o Médio são os números de sempre (`tests/regrasDosJogos.test.ts`)
- [x] 2.2 Nível por jogo, guardado no aparelho (`src/lib/jogos/nivelDoJogo.ts`); escolhido na pausa
      (`casca/SeletorDeNivel.tsx`), e trocar recomeça a rodada; o cabeçalho diz o nível quando não é o
      Médio. Conferido no app rodando (Karuta: 8 s no Médio, 12 s no Fácil).
      Falta: o que muda além dos números (primeira letra dada, menos alternativas), jogo a jogo
- [x] 2.3 Ajudas gerais (`casca/AjudasGerais.tsx`) nos cinco jogos com relógio POR JOGADA (Karuta,
      Choseong, Rali, Shiritori, Tabu): "+10 s" (de graça; 3, 2 ou 1 por rodada conforme o nível) e
      "Ver resposta". Decisões: "Ver resposta" conta como `revealed` ("não lembrei"), igual ao tempo
      esgotado, e não como `hinted`: ver a palavra não é lembrar com ajuda. O Duelo fica fora (o relógio
      é da rodada e já devolve segundos). Conferido no app (Rali: 6 s viram 15 s; "A resposta era: rock")
- [x] 2.4 Depois de dois erros seguidos as ajudas que ainda dá para usar acendem (`data-socorro` no
      placar; o pulso em `questMovimento.css`, só no movimento rico). Quem conta é o motor de
      comemoração (`EVENTO_DA_JOGADA`), então vale em todos os jogos sem mexer em cada um
- [x] 2.5 O app já tinha o passo a passo na primeira partida (`TourGuiado`, chave `babel_tour_<jogo>`)
      e a ficha "Como se joga" na antessala e na pausa: as três telas do protótipo seriam uma terceira
      explicação. Entrou o que faltava: o botão "Como se joga" no alto do jogo, a um toque, que para o
      relógio. Falta (se o dono quiser): rever o passo a passo guiado a partir da ficha
- [x] 2.6 Tela de fim: abaixo de 50% de acerto oferece um degrau abaixo; com 100%, um acima
      (`casca/SugestaoDeNivel.tsx`, regra em `sugestaoDeNivel`). Aceitar joga de novo as mesmas palavras
      no nível novo. Conferido no app (Rali no Médio com 0%: "Jogar no Fácil" recomeça com 9 s)
- [x] 2.7 Menos atrito, um jogo por commit:
      - Choseong: só a vogal errada sai, as certas ficam
      - Frase embaralhada: o começo certo fica, as outras palavras voltam sozinhas
      - Memória: explorar não é errar (só conta quando o par da primeira carta já tinha aparecido);
        muda também a nota de revisão, que antes caía por cartas nunca vistas
      - Bao: a cova errada desmarca em 700 ms; o aviso escrito continua
      - Ditado: segunda chance antes de fechar a fala; a correção só aparece no fim
      - Termo: nada a fazer, a linha seguinte já nasce com as letras descobertas
        (`linhaInicial`)
      - Rali: não se aplica, no app a devolução é escrita livre e conferida de uma vez
- [x] 2.8 Retorno de acerto e erro igual em todos os jogos: já era assim no app (todo jogo fala com
      `celebrar`, e o combo só comemora quando o multiplicador sobe, em `HudDaRodada`). Nada a mudar
- [ ] 2.9 Testes de componente feitos em cada item. Falta o e2e dos jogos, que depende da CI voltar
      a passar na `main` (login duplicado no `e2e-publico`)

## 3. Miniaturas

- [ ] 3.1 Cena por jogo no cartão do lobby novo (`LobbyDoQuest.tsx`), parada e viva ao apontar
- [ ] 3.2 Cena própria para os nove jogos culturais (hoje reaproveitam a de outros)

## 4. Rali e Mala

- [ ] 4.1 Rali: quadra, bola como relógio, caixas por letra, placar Você × Babel
- [ ] 4.2 Mala: tampa que abre e fecha, etiquetas, adesivos, rota dos níveis

## 5. Tema Água

- [ ] 5.1 Cores (claro e escuro), catálogo, som, partículas, par da prévia
- [ ] 5.2 A cena: superfície, luz, bolhas, ondas de toque; inclinação pelo giroscópio
- [ ] 5.3 Decisão sobre `tests/temas-v2.test.ts` (fundo em CSS puro × canvas)

## 6. Telas

- [ ] 6.1 Planos fácil de achar (trilho, Início, Ajustes, busca)
- [ ] 6.2 Personalizar, Loja e passe (a trilha inteira à vista)
- [ ] 6.3 Sessão: player que marca palavra por palavra
- [ ] 6.4 Intérprete no tema claro; aviso do Premium em linha própria
- [ ] 6.5 Capturar e Intérprete abrem direto na tela de uso

## 7. O desenho novo no celular

- [ ] 7.1 Chave e casca: barra flutuante de cinco destinos
- [ ] 7.2 Folhas de baixo, carrosséis, cabeçalhos
- [ ] 7.3 Passada tela por tela (sobreposição, texto vazando)
