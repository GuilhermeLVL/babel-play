# Jogos — QA de ponta a ponta e polimento (2026-09-26)

Branch `feat/jogos-premium` (worktree `.claude/worktrees/fx-jogos`), sobre a `main` em `4f33ca16`
(já com o fluxo "idioma da sessão"). Sem push.

## Como foi feito

**Diagnóstico por reprodução real.** Os 18 jogos foram jogados do início ao fim por uma bateria
Playwright própria (`scratchpad/jogar.cjs`), que usa a Trilha embutida para saber as respostas e uma
voz falsa em `speechSynthesis` que registra o que o jogo fala (e um reconhecimento de fala falso que
"ouve" essa voz). Cada jogo passou por: início, acerto, erro, dica, pular/revelar, áudio, deixar o
tempo acabar (nos com relógio), fim de rodada, recompensa, pausa (Esc) e, no Caça-palavras, toque
real por CDP (`Input.dispatchTouchEvent`) e teclado.

| Cenário | Onde |
|---|---|
| Edição estática (produção) | `npm run build:estatica` servida como o Pages (`_servidor-estatico.mjs`, porta 4191) |
| Build normal | `tests/e2e/sessao-de-jogo`, `fsrs-revisao`, `seeds` com `dev:local` na porta 3197 e banco descartável |
| Desktop 1280 e celular 375 (toque) | as duas molduras em toda a bateria |
| Vocabulário em inglês | Trilha embutida (`dist/trilha/en.json`, 2.784 palavras) |
| Vocabulário em português | 24 cartões com acento, cedilha, til e o par avó/avô injetados no IndexedDB `babel-local` (não há trilha pt) |
| Voz | com vozes en+pt; **só voz inglesa** (o caso do aparelho sem a voz da pista); sem vozes |

Screenshots de todas as passagens: `scratchpad/jogos/` (466 arquivos, prefixos `antes-`, `depois-`,
`pt-`, `soen-`, `semvoz-`). Um conjunto curado está em [`img/`](img/).

Severidade: **P0** quebra o jogo · **P1** atrito forte (ensina errado, esconde a resposta, trava) ·
**P2** polimento/consistência.

## Bugs por jogo

Linha de código = a do código **antes** da correção.

| ID | Jogo | Sev. | Passos → esperado × obtido | Causa | Estado |
|---|---|---|---|---|---|
| J-01 | Caça-palavras | **P0** | 375 px, toque: arrastar da 1ª à última letra, ou tocar nas duas pontas → marca a palavra × "Tente de novo", nada marcado. Injogável no celular | `WordSearchGame.tsx:306-313`: só `onPointerEnter`/`onPointerUp` nas células; no toque o ponteiro fica capturado na célula de partida | Corrigido `c13cea53` |
| J-02 | Caça-palavras | P1 | Teclado: Tab até a célula, Enter na 1ª e na última → marca × nada (e 169 paradas de Tab) | mesmas linhas: nenhum handler de teclado | Corrigido `c13cea53` (Enter/Espaço marcam as pontas, setas andam, um Tab só, Esc desfaz) |
| J-03 | Mala | **P0** | Abrir o jogo → ver a 1ª palavra e depois reconstruir × a mala abre e fecha **debaixo do 3-2-1** (palco inerte); a 1ª pergunta é sobre palavra não vista. Rodada medida: 0 de 1 | `KofferGame.tsx:134-148`: o relógio de "mala aberta" ignorava `ativo` | Corrigido `8255f9b6` |
| J-04 | Mala | P1 | Acertar posições → pontos sobem × placar parado em 0 | `KofferGame.tsx:57`: `usePlacarDaRodada` sem `recontar` | Corrigido `8255f9b6` |
| J-05 | Mala | P1 | Pausar com a mala aberta → tempo congela × continuava correndo | igual J-03 | Corrigido `8255f9b6` |
| J-06 | Choseong | P1 | Deixar o tempo acabar → ver qual era × pula para a próxima sem mostrar | `ChoseongGame.tsx:130-135` | Corrigido `21610467` |
| J-07 | Bao | P1 | Errar 3 covas → ver a palavra × pula sem mostrar | `BaoGame.tsx:134-164` | Corrigido `21610467` |
| J-08 | Tabu | P1 | Escolher errado (ou deixar o tempo acabar) → ver a certa × troca de carta na hora | `TabooGame.tsx:115-129, 166-178` | Corrigido `21610467` |
| J-09 | Karuta | P1 | Tempo da carta acaba → ver a certa × pula sem mostrar | `KarutaGame.tsx:149-154` | Corrigido `21610467` |
| J-10 | Karuta | P1 | Aparelho com voz só em inglês, interface em pt → ouvir a pista × pista **escondida** (porque "há síntese de voz") e falada com voz inglesa (antes) / muda (com o `falar` novo). Insolúvel | `KarutaGame.tsx:202`: `isTtsSupported()` não é "há voz para a pista" | Corrigido `21610467`: sem voz do idioma a pista aparece escrita; com voz, "Ler a pista" é uma dica |
| J-11 | Shiritori | P1 | Tempo do elo acaba → ver o elo × pula sem mostrar | `ShiritoriGame.tsx:88-99` | Corrigido `21610467` |
| J-12 | Rali | P1 | Pista "grandfather", escrever **avó** → erro × aceito (avó/avô viram a mesma chave) | `TenseTennisGame.tsx:144`: `chaveDoTermo` dos dois lados | Corrigido `21610467` (régua única, abaixo) |
| J-13 | Rali | P1 | Pista "quarto", escrever **bedroom** (o acervo tem room e bedroom com essa tradução) → aceito × "Fora!" | idem; o item não conhecia os sinônimos da pista | Corrigido `e3b3758d` + `21610467` |
| J-14 | Termo | P1 | pt, Dueto FELIZ/LEITE: palpite FELIZ deixa o E verde; digitar LEITE inteiro → aceita × a linha vira **LEEIT**; 6 palpites certos recusados até o degrau acabar (2 de 3) | `TermoGame.tsx:438-448`: `digitar` pulava as casas já conhecidas via `proximaVaga` | Corrigido `747bdb8b` |
| J-15 | Karaokê | P1 | Falar e o reconhecimento terminar sem resultado → volta a "Falar agora" × "Parar" preso; e falar durante o "Ouvir" → a gravação é derrubada pelo relógio da escuta | `KaraokeGame.tsx:132-134` (fase lida do fecho do clique) e `78-83` (relógio do Ouvir vivo) | Corrigido `5ed7e900` (reproduzido em teste de componente; no navegador o 2º defeito mascarava o 1º) |
| J-16 | Frase embaralhada | P1 | Botão "Recomeçar" dentro do palco limpa só a linha; o do topo, com o mesmo nome, refaz a rodada | `ScrambleGame.tsx:288` | Corrigido `ae54a12a` → "Limpar a linha" |
| J-17 | Sala de escolha (Jogar) | P1 | Caderno só em pt, 1ª visita → abrir no português × "português 23" desmarcado, "Minhas gravações 0", "Esta escolha não tem palavras prontas ainda" | `SalaDeEscolha.tsx:82`: abria sempre no idioma vigente (`en`) | Corrigido `d1690f29` |
| J-18 | Ditado / Karaokê | P1 | Russo: escrever "привет" para "Привет," → certo × errado (pontuação só era tirada em A–Z) | `escuta.ts:164` | Corrigido `e3b3758d` |
| J-19 | Duelo, Karuta, Tabu, Vitendawili | P2 | Baralho com "Bank" e "bank" → uma alternativa × duas cartas iguais, uma "errada" | `itemSource.ts:284-287` | Corrigido `e3b3758d` |
| J-20 | Memória e demais | P2 | Dois cartões da mesma palavra → uma vez na rodada × duas cartas "bank" idênticas, só uma casava | `itemSource.ts:209-234` | Corrigido `e3b3758d` |
| J-21 | Frase embaralhada, Ditado, Karaokê | P2 | Japonês: frase vira peças/palavras × a frase inteira era UMA palavra (Frase embaralhada não montava) | `scramble.ts:31`, `escuta.ts:158` (`split(/\s+/)`) | Corrigido `ae54a12a` (`palavrasDaFrase`) |
| J-22 | Termo | P2 | Palavra sem idioma → não fala × `toBcp47(lang \|\| 'en')`: voz inglesa por padrão | `TermoGame.tsx:372, 508` | Corrigido `ae54a12a` (`falar`) |
| J-23 | Tabu, Shiritori | P2 | Fim da rodada → fim comum × tela própria ("Fim da corrente") com pontos repetidos e um clique a mais | `TabooGame.tsx:138-158`, `ShiritoriGame.tsx:110-130` | Corrigido `21610467` |
| J-24 | Tabu | P2 | O texto é frase de exemplo → rótulo "Frase" × "Definição" | `TabooGame.tsx:206` | Corrigido `21610467` |
| J-25 | Cadavre | P2 | Conferir → placar com o valor × HUD em 0 a rodada inteira | `CadavreExquisGame.tsx:39` | Corrigido `ae54a12a` |
| J-26 | Choseong | P2 | Teclar vogal durante a contagem/pausa → nada × escrevia | `ChoseongGame.tsx:191-206` | Corrigido `21610467` |
| J-27 | Duelo, Qual foi?, Karuta, Vitendawili, Tabu, Shiritori | P2 | Jogar pelo teclado → tecla da alternativa × só Tab (no Duelo, contra o relógio) | ausência de atalho | Corrigido `22ae62e4` (1–9, `aria-keyshortcuts`) |
| J-28 | Caça-conectores | P2 | Bloqueado na Trilha → motivo real × "a trilha tem palavras soltas" (falso: a Frase embaralhada joga com as frases da Trilha) | `Play.tsx:3379`, `estadoDosJogos.ts:80` | Corrigido `9d9c6277` |
| J-29 | Choseong, Karuta, Rali | P2 | Contador "N de M" repetido embaixo do tabuleiro (o placar já tem) | — | Corrigido `21610467` |
| J-30 | Duelo | P2 | Fim: tela própria (estrelas, recorde) antes do fim comum | escolha de encenação (arcade, recorde, ranking opcional na versão com servidor) | **Ficou** — ver abaixo |
| J-31 | Karuta, Bao, Tabu… | P2 | Texto das cartas/covas deveria sair em `font-display` black × sai em peso normal | regra global de `button` dentro de `.palco-jogo` (`prototipo.css`) vence as classes | **Ficou** — ver abaixo |
| J-32 | Todos | P2 | Após a rodada, até 3 modais em fila (baú, conquista, nível) antes do resultado | economia (ADR 0002) | **Ficou** — ver abaixo |
| — | Mala | — | Página do Chromium caiu na bateria | só com o reconhecimento de fala falso da bateria; memória estável, não reproduz sem ele | Não reproduzido no app |

## O que mudou, por tema

- **Régua única de resposta escrita** (`core/minigames/resposta.ts`): caixa, espaço, hífen e
  pontuação não contam; **acento ausente** é aceito e a tela mostra a grafia certa ("Certo! Com
  acento: coração"); **acento trocado** é erro (avó ≠ avô); **outra palavra do acervo com a mesma
  pista** vale ("Também vale! A palavra desta pista era: room"). Marca de outro alfabeto não é acento
  (o dakuten muda a palavra). O Ditado passa a tirar pontuação em qualquer alfabeto.
- **Rodada justa**: sem alternativas repetidas por caixa, a mesma palavra uma vez por rodada, e o
  item carrega as `alternativas` da mesma pista (`core/minigames/itemSource.ts`).
- **Quem não chegou lá sai sabendo a resposta**: componente comum `casca/AvisoDaJogada` (o desenho do
  aviso que o Rali já tinha), usado por Choseong, Bao, Karuta, Shiritori, Tabu, Mala e Rali; a palavra
  é dita e a tela espera o bastante para ler.
- **Mesmos controles e mesmo fim**: Tabu e Shiritori terminam no fim de rodada comum; teclas 1–9 nos
  seis jogos de múltipla escolha (`casca/atalhos.ts`); Choseong e Karuta respeitam pausa e contagem.
- **Estados vazios honestos**: a sala abre no idioma que tem palavras; o Caça-conectores diz o motivo
  real na Trilha; a Karuta sem voz do idioma mostra a pista.
- **Textos novos via i18n**: 23 frases com `t()`, inglês no catálogo, `xx`/cobertura regenerados.

## Integração com "idioma da sessão"

Feito o `git merge main` pedido. Nos jogos:

- **Toda fala por `falar(texto, idioma)`** (`lib/tts.ts`): Memória, Duelo, Caça-palavras, Termo (sem o
  `|| 'en'`), Frase embaralhada, Vitendawili, Cadavre, Karuta, Choseong, Rali, Mala, Bao, Shiritori e o
  `lib/falante.ts` dos três jogos de escuta. Nenhum `speak()` restante em `components/minigames`.
- **`idiomaDoCartao(card)`** (`core/texto/idioma.ts`) é a origem do idioma dos itens em `buildItems`,
  na escada do Termo e nas falas da Trilha (`b600c077`).
- **Segmentação**: `core/minigames/palavrasDaFrase.ts`. Em japonês/chinês/tailandês o corte é o de
  `palavrasDoTexto`. Em idioma com espaço a peça continua a **palavra como escrita** — decisão
  deliberada: `palavrasDoTexto` devolve o verbete ("John's" → "John", "d'água" → "água", "fazê-lo" →
  "fazer"), certo para vocabulário, errado para a Frase embaralhada, que precisa remontar a frase
  ouvida. Usado em Frase embaralhada, Ditado, Karaokê, Qual foi? e Caça-conectores. O **Bingo** usa
  `palavrasDoTexto` direto (compara verbetes: "fazê-lo" acende "fazer").
- O efeito de `Play.tsx` que usa o idioma da gravação foi preservado (a única mudança minha em
  `Play.tsx` é o texto do motivo do Caça-conectores).

## Antes × depois (mesma bateria, mesma edição estática)

| Verificação | Antes | Depois | Imagens |
|---|---|---|---|
| Caça-palavras 375 px, arrasto por toque | não marca ("Tente de novo") | marca | [antes](img/antes-wordsearch-m375-1-toque.png) · [depois](img/depois-wordsearch-m375-1-toque.png) |
| Caça-palavras 375 px, toque na 1ª e na última | não marca | marca (teste de componente + e2e) | — |
| Caça-palavras desktop, Enter nas pontas | não marca | marca | — |
| Mala, desktop e 375 px | 0 de 1 (pede palavra nunca vista) | 8 de 8 | [antes](img/antes-koffer-m375-nunca-vi.png) · [depois](img/depois-koffer-m375-0-inicio.png) |
| Mala, placar após acertos | 0 | 17 no nível 2 | — |
| Choseong, tempo esgotado | segue sem resposta | "O tempo acabou. Era: bear" | [antes](img/antes-choseong-d1280-2-tempo.png) · [depois](img/depois-choseong-d1280-2-tempo.png) |
| Bao, perdeu a palavra | segue sem resposta | "Acabaram as tentativas. Era: thing" | [antes](img/antes-bao-m375-2-perdeu.png) · [depois](img/depois-bao-m375-2-perdeu.png) |
| Tabu, escolha errada | troca de carta na hora | "Não era essa. Era: color", certa em verde | [antes](img/antes-taboo-d1280-1-erro.png) · [depois](img/depois-taboo-d1280-1-erro.png) |
| Shiritori, tempo esgotado | segue sem resposta; tela "Fim da corrente" | elo revelado; fim comum | [depois](img/depois-shiritori-d1280-2-tempo.png) |
| Karuta com voz só em inglês | pista escondida, dita com voz inglesa | pista escrita ("dia"), nada em voz errada | [antes](img/soen-karuta-d1280-0-inicio.png) · [depois](img/depois-soen-karuta-d1280-0-inicio.png) |
| Termo em pt (Dueto FELIZ/LEITE) | 2 de 3 (LEITE recusado 6×) | 3 de 3 (LEITE de primeira) | — |
| Sala com caderno só em pt | "0 palavras prontas" | "português 19 · 19 palavras prontas" | [antes](img/antes-sala-pt-d1280.png) · [depois](img/depois-sala-pt-m375.png) |
| Rali: "COST", " favorite. " | aceitos | aceitos | — |
| Rali: avó para "grandfather" | aceito | recusado, "Fora! Era: avô" (teste) | — |

## O que ficou, e por quê

- **J-30 Duelo com tela própria de fim.** É a encenação "arcade" pedida pelo dono (estrelas, recorde
  local, fanfarra) e é onde mora o envio opcional ao ranking na versão com servidor. Tirá-la mexe na
  economia de recordes e no ranking — fora do escopo de mecânica desta rodada. Os outros dois jogos
  com tela duplicada (Tabu, Shiritori) não tinham nada além dos números e foram unificados.
- **J-31 Peso da fonte nas cartas.** A causa é uma regra global de CSS do protótipo que vence as
  classes utilitárias dentro do palco. Corrigir em `prototipo.css` afeta todas as telas e é da
  frente de design/"frontend perf"; não reinventei o visual.
- **J-32 Modais de recompensa em fila.** Economia (ADR 0002), fora da mecânica dos jogos. Registro
  como atrito: até três modais antes do resultado.
- **Caça-conectores na Trilha continua bloqueado** (decisão documentada em `estadoDosJogos.ts`: 4,5%
  das frases têm conector); só o motivo passou a ser verdadeiro.
- **Karaokê com Web Speech** continua dependendo do reconhecimento do navegador (serviço de nuvem no
  Chrome) — tema de captura/dispositivos, apontado na auditoria dos planos.

## Achados fora da minha fronteira (para os agentes responsáveis)

1. **Idioma da sessão — o reparo local troca português por tcheco/romeno.** Com 24 cartões `pt` de uma
   sessão monolíngue em português, depois do primeiro carregamento: `escola`, `cidade`, `viagem` →
   `cs`; `trabalho` → `ro` (e somem da prática em português). Causa provável:
   `src/core/texto/reparoDeIdioma.ts:120` reclassifica o cartão pela frase de exemplo com só 4–5
   palavras ("A escola fica perto daqui.") antes de olhar a sessão, que é monolíngue `pt`. Não mexi.
2. **Economia — `tests/e2e/seeds.e2e.ts` no celular falhou uma vez** ("tela 54 vs servidor 114")
   quando rodou logo depois do `fsrs-revisao`; isolado passou 4 de 4 (celular e desktop, 2× cada).
   Dependência de ordem, não dos jogos.

## Portões

| Portão | Resultado |
|---|---|
| `tsc --noEmit` | 0 erros |
| `eslint src server server.ts tests --max-warnings 0` | 0 problemas |
| `vitest run --maxWorkers=3` | 506 arquivos, 5.172 testes passam, 2 pulados |
| `npm run i18n:orfas` (+ `pseudo --check`, `cobertura --check`) | 0 órfãs; catálogos em dia |
| `npm run build` | ok |
| `npm run build:estatica` | ok (408 arquivos) |
| e2e estática (`playwright.estatica.config.ts`, desktop 1280 + celular 375) | 43 passam, 1 pulado (pré-existente); inclui `jogos.e2e.ts` = 18 casos × 2 |
| e2e build normal (`sessao-de-jogo`, `fsrs-revisao`, `seeds`; desktop + 375) | 9 de 10; `seeds` (375) intermitente por ordem, isolado 4/4 |

Testes novos: `respostaTolerante`, `itensDaRodadaJustos`, `wordsearchGame`, `jogosRevelamResposta`,
`segmentacaoNosJogos`, `idiomaInicialDaSala`, `atalhosDasAlternativas`, `termoLetrasConhecidas` e
casos novos em `kofferGame`, `karaokeGame`, `salaDeEscolha`; e2e `tests/e2e-estatica/jogos.e2e.ts`
(todos os jogos até o fim de rodada comum, com as verificações das correções). Todos falharam antes
da correção correspondente.

## Commits (`feat/jogos-premium`)

```
b600c077 refactor(jogos): o idioma dos itens sai de idiomaDoCartao
17998775 test(e2e): os 18 jogos de ponta a ponta na edição estática
747bdb8b fix(jogos): Termo não embaralha a palavra digitada quando a linha já tem letras conhecidas
9d9c6277 fix(jogar): o motivo do Caça-conectores na Trilha diz a verdade
1feda943 i18n(jogos): inglês das frases novas dos jogos e catálogos regenerados
22ae62e4 feat(jogos): teclas 1–9 escolhem a alternativa nos jogos de múltipla escolha
d1690f29 fix(jogar): a sala abre no idioma que tem palavras
ae54a12a feat(jogos): voz e segmentação pelo idioma da fala
5ed7e900 fix(jogos): karaokê não fica preso em 'Parar' nem perde a gravação
21610467 fix(jogos): quem não chegou lá sai sabendo a resposta; Rali com a régua única
8255f9b6 fix(jogos): a mala só abre para quem já está jogando (P0) e o placar soma
c13cea53 fix(jogos): caça-palavras jogável por toque e por teclado (P0)
e3b3758d feat(jogos): régua única de resposta escrita e rodada sem opções repetidas
```
