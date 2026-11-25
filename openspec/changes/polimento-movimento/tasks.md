> **Revisão de 25/11/2026** (main `897c9d25`): as fases 5, 6 e 7 já estão no código (marcadas abaixo com o arquivo que prova); o
> que sobra é o grupo 8 (reconciliar o `estado.md`, que parou em 10/10) e as aprovações do dono. Em tarefa feita, a prova é o teste ou a
> conferência citada na própria linha; em tarefa aberta há `Verificar:`. Legenda: **[D]** dono, **[R]** aparelho real.
> **08/10/2026: passada de fidelidade.** As fases 0 a 4 abaixo foram entregues de forma aproximada e estão
> sendo refeitas contra o protótipo. O estado que vale é o de `fidelidade/estado.md`.

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
- [ ] 1.10 Testes de `questCasca` e os e2e de fumaça atualizados.
      Verificar: `npx vitest run tests/movimentoDaCasca.test.ts tests/questCasca*.test.tsx` verde e `npx playwright test tests/e2e/acessibilidade.e2e.ts` sem regressão (movimento reduzido continua respeitado).

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
- [x] 2.7 Menos atrito, um jogo por commit: - Choseong: só a vogal errada sai, as certas ficam - Frase embaralhada: o começo certo fica, as outras palavras voltam sozinhas - Memória: explorar não é errar (só conta quando o par da primeira carta já tinha aparecido);
      muda também a nota de revisão, que antes caía por cartas nunca vistas - Bao: a cova errada desmarca em 700 ms; o aviso escrito continua - Ditado: segunda chance antes de fechar a fala; a correção só aparece no fim - Termo: nada a fazer, a linha seguinte já nasce com as letras descobertas
      (`linhaInicial`) - Rali: não se aplica, no app a devolução é escrita livre e conferida de uma vez
- [x] 2.8 Retorno de acerto e erro igual em todos os jogos: já era assim no app (todo jogo fala com
      `celebrar`, e o combo só comemora quando o multiplicador sobe, em `HudDaRodada`). Nada a mudar
- [ ] 2.9 Testes de componente feitos em cada item. Falta o e2e dos jogos, que depende da CI voltar
      a passar na `main` (login duplicado no `e2e-publico`). Reconferir se a CI voltou a passar.
      Verificar: `npx playwright test tests/e2e/jogos*.e2e.ts` verde (há `_jogos.ts` de apoio) e a CI da `main` verde no e2e público.

## 3. Miniaturas

- [x] 3.1 Cena por jogo no cartão do lobby novo (`LobbyDoQuest.tsx`, faixa `.qj-cena`), parada; com
      movimento rico e ponteiro de verdade ela se aproxima 6% ao apontar. Decisão: nada se mexe sozinho
      numa grade de dezoito cartões (o protótipo animava a cena inteira). Custo: cada cartão ficou
      uns 100 px mais alto, então o lobby rola mais. Conferido no app, tema escuro
- [x] 3.2 Cena própria para os nove jogos culturais em `ArteDosJogos.tsx` (Karuta, Choseong, Rali,
      Mala, Bao, Charada, Shiritori, Cadavre, Tabu); `tests/arteDosJogos.test.tsx` trava que nenhuma
      se repete e que não há cor literal

## 4. Rali e Mala

- [x] 4.1 Rali (desenho novo): placar Você × Babel e a quadra com a bola como relógio (sai do lado do
      Babel, passa a rede na metade do tempo, fica vermelha no fim). Sem caixas por letra, de propósito:
      o app aceita sinônimo de outro tamanho e as caixas diriam um tamanho só
- [x] 4.2 Mala (desenho novo): rota dos níveis, alça, tampa que levanta quando a mala abre, palavras
      como etiquetas de bagagem. Sem adesivos (enfeite sem função). Conferido no app, tema escuro

## 5. Tema Água

- [x] 5.1 Cores (claro e escuro), catálogo, som, partículas, par da prévia. Feito: `tema-agua` em `src/core/catalogoV2.ts:59`, `src/lib/polimento/agua.ts`, `tests/polimentoAgua.test.ts`.
- [x] 5.2 A cena: superfície, luz, bolhas, ondas de toque; inclinação pelo giroscópio. Feito: `src/lib/polimento/aguaCena.ts`.
- [x] 5.3 Decisão sobre `tests/temas-v2.test.ts`: a regra de "fundo em CSS puro" ganhou a exceção escrita e cercada para o Água (canvas; ver o comentário em `tests/temas-v2.test.ts:155`).
- [ ] 5.4 **[D]** Aprovar a aparência do tema Água (prova lado a lado com o protótipo). Verificar: capturas do tema claro e escuro do protótipo e do app na mesma medida, aprovadas pelo dono; `npx vitest run tests/polimentoAgua.test.ts tests/temas-v2.test.ts`.

## 6. Telas

- [x] 6.1 Planos fácil de achar (trilho, Início, Ajustes, busca). Feito: `src/lib/polimento/planos.ts`, `tests/polimentoPlanos.test.tsx`. Os textos agora são os da v4 (Plus, não "Premium").
- [x] 6.2 Personalizar, Loja e passe. Feito: `src/lib/polimento/personalizar.ts`, `tests/polimentoPersonalizar.test.tsx`.
- [x] 6.3 Sessão: player que marca palavra por palavra. Feito: `src/lib/polimento/sessao.ts`, `tests/polimentoSessao.test.tsx`.
- [x] 6.4 Intérprete no tema claro. Feito: `src/lib/polimento/interprete.ts`, `tests/polimentoInterprete.test.tsx`. O "aviso do Premium" virou o aviso do plano que a matriz declarar.
- [x] 6.5 Capturar e Intérprete abrem direto na tela de uso. Feito: `src/lib/polimento/captura.ts`, `tests/polimentoCaptura.test.tsx`, `fidelidade/ficou-de-fora.md`.

## 7. O desenho novo no celular

- [x] 7.1 Chave e casca: barra flutuante de cinco destinos. Feito: commit `87b53ad7`, `src/styles/polimentoCelular.css`, `tests/polimentoCelular.test.tsx`. A chave deixou de existir: o desenho novo é o único (`fidelidade/apagar-o-legado.md`).
- [x] 7.2 Folhas de baixo, carrosséis, cabeçalhos. Feito: `src/lib/polimento/folha.ts`, `tests/polimentoFolha.test.ts`.
- [ ] 7.3 **[R]** Passada tela por tela (sobreposição, texto vazando) em celular real, incluindo a barra de cinco (o dono ainda precisa aprovar a aparência).
      Verificar: e2e em 375x667 e 390x844 (`npx playwright test tests/e2e/polimento-*.e2e.ts`, a criar) sem rolagem horizontal; capturas aprovadas pelo dono; avisos e conversa conferidos depois dos PRs #205 e #206 (a legenda vem primeiro no celular).

## 8. Fechar a passada de fidelidade (novo em 25/11/2026)

- [x] 8.1 Reconciliar `fidelidade/estado.md` com o código. O arquivo parou em 10/10 e ainda diz "aberto" para blocos C, E, F, "Jogos 2", "Jogos 8" e "18 cenas: 1 de 18",
      mas já existem `src/lib/polimento/{sentidos,niveis,celular,minis,jogos}.ts`, os componentes `*DoPrototipo.tsx` de oito jogos e `tests/polimento*.test.*` (23 arquivos).
      Verificar: tabela item a item (A1 a F, Jogos 1 a 8) com `feito` ou `aberto` e o teste ou arquivo que prova; nenhum item sem prova fica `feito`.
      FEITO em 25/11/2026: tabela por bloco em `fidelidade/estado.md` com arquivo e teste de cada um. A prova visual lado a lado segue [D] (8.3).
- [x] 8.2 Decidir o que da lista "Aberto" do `estado.md` ainda vale (B18, B39 a B41, B48, B49; ajudas dos outros jogos; sons dos jogos; saída animada das telas de dentro do Jogar).
      Verificar: cada item vira tarefa numerada com `Verificar:` ou é riscado com motivo; o `estado.md` termina sem "aberto" sem dono.
      FEITO em 25/11/2026: B18, B48 e B49 riscados (sem descrição no inventário; reabrem se o dono apontar), sons dos jogos já portados, o resto virou 8.6 a 8.9.
- [x] 8.5 Conferir o padrão do "reduzir movimento" do sistema. `aplicarAcess` (`src/lib/polimento/base.ts`) faz o app ignorar `prefers-reduced-motion`
      "enquanto as animações estiverem ligadas", e o `estado.md` diz o contrário ("o protótipo vence, menos contraste de leitura e o reduzir movimento do sistema").
      Verificar: teste novo: com `prefers-reduced-motion: reduce` e sem escolha explícita, `data-movimento` é `contido`; se hoje for `rico`, é defeito de acessibilidade a corrigir (público com menores).
      FEITO em 25/11/2026 (decisão assumida: recomendação do item 16 de `decisoes-do-dono.md`, sim, 25/11): era defeito. `useAparencia` nascia com as animações ligadas e a classe `animations-on` fazia `reduz()` e o CSS ignorarem o sistema. Agora `animacoesLigadasPorPadrao` (`src/lib/movimento/padraoDeAnimacoes.ts`) liga por padrão só se o sistema não pede menos movimento; escolha guardada vence nos dois sentidos. Prova: `tests/movimentoReduzidoDoSistema.test.ts`.
- [ ] 8.3 **[D]** (decisão assumida: recomendação 16, aprovar com capturas lado a lado e manter a exceção do canvas em `temas-v2`, 25/11; a aprovação em si é do dono, e o dono está escolhendo entre 4 direções de design: NÃO mexer em paleta, tipografia ou aparência geral até lá) Aprovar a aparência da barra de cinco e do tema e decidir `temas-v2` (5.3 do README). Verificar: aprovação registrada no `estado.md` com a data.
- [ ] 8.4 (aberta: a varredura dos textos dos 18 jogos e da explicação em três telas nos três catálogos é grande e colide com `Play.tsx`; fica para a sessão de jogos) Textos novos de jogos e da explicação em três telas passados por `t()` e nos catálogos (hoje "em português também para quem usa em inglês").
      Verificar: `npm run i18n` sem diferença; `npx vitest run tests/i18n*.test.ts` verde.
- [ ] 8.6 Ajudas "+10 s" e "Ver resposta" nos jogos sem relógio por jogada (Duelo, Termo, Caça-palavras). Mexe em `Play.tsx` e nas cenas: fica para depois da onda, com a `tela-de-jogos-v2`.
      Verificar: teste de componente de cada jogo com a ajuda; `npx vitest run tests/polimentoJogos.test.tsx`.
- [ ] 8.7 Partículas com paralaxe, rajada e confete (B39 a B41). O app tem motor próprio (`juice.ts`); trocar é mudança de aparência, **[D]**.
      Verificar: decisão do dono registrada no `estado.md`.
- [ ] 8.8 Primeira letra dada e menos alternativas por nível, jogo a jogo (resto de 2.2).
      Verificar: `tests/regrasDosJogos.test.ts` com os casos novos.
- [ ] 8.9 Saída animada das telas de dentro do Jogar (lobby, antessala, rodada, fim). Pede segurar a desmontagem em `Play.tsx` e `useNavegacao`; fica atrás do `motor-anki-jogos` e da `tela-de-jogos-v2`.
      Verificar: teste de que a saída respeita `semMovimentoDeTela()` e e2e com movimento reduzido.
