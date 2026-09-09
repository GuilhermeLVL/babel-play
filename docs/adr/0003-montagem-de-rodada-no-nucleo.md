# ADR 0003 — Levar a montagem de rodada para o núcleo, injetando o que depende do navegador

- **Data:** 2026-09-09
- **Estado:** aceito
- **Change OpenSpec:** `dividir-arquivos-deus`

## Contexto

`montarRodada` era o achado estrutural mais citado das duas auditorias anteriores: oito ramos, doze
pontos de chamada, dentro de uma closure de `src/components/views/Play.tsx` que lia quinze valores
do componente e devolvia por `setState`.

O efeito não era estético. **Nenhum dos oito ramos tinha teste**, porque exercitar a função exigia
renderizar um arquivo de 4.236 linhas com a rede de pé. A função que decide o que a pessoa vai
jogar — qual material, de qual fonte, em qual ordem, respeitando o que já caiu — era a menos
verificável do repositório.

A parte pura da composição (`compor`, em `src/core/minigames/composicao.ts`) já morava no núcleo. O
que faltava era a montagem, e ela ficava do lado de fora por três dependências de navegador:
`Date.now()`, uma leitura de `localStorage` e uma URL de blob de áudio.

## Decisão

**A montagem vai para `src/core/minigames/rodada.ts` como função pura, e as três dependências de
navegador entram por parâmetro — duas como funções injetadas, uma como booleano.**

| dependência | como entrou |
|---|---|
| `Date.now()` | `agora: number` — o campo que faltava para o teste existir |
| `decisaoAuto` (lê `localStorage` e um `ref`) | função injetada, para manter a chamada preguiçosa: só os ramos que precisam a invocam |
| `origemDaPalavra` (fecha sobre um memo) | função injetada |
| `audioParaJogos` (URL de blob) | `temAudio: boolean` — o núcleo precisa saber **se** há áudio, não qual |

`EntradaDaRodada` tem 22 campos e `RodadaMontada` devolve o material numa união etiquetada, que a
tela consome com um `switch` exaustivo. Zero `any`; o núcleo é `strict` e sem DOM.

## Alternativas consideradas

**Deixar os ramos dependentes no componente e mover só os puros.** Era a saída prevista, e não foi
necessária: injetar duas funções custou menos que manter dois lugares onde a rodada nasce. Ficaria,
além disso, a pior propriedade da versão antiga — não dá para responder "onde a rodada é montada?"
com um arquivo.

**Passar o componente inteiro como contexto.** Traria `localStorage` e o DOM para dentro do núcleo
por uma porta lateral, quebrando a fronteira que `src/core/tsconfig.json` declara.

**Não mover, e testar renderizando o componente.** Exigiria montar 4.236 linhas com a rede
disponível para cada um dos oito ramos. É o motivo de não haver teste até hoje.

## Consequências

Melhora: os oito ramos ganharam 25 casos de caracterização com `agora` fixo, e a decisão de o que
jogar passou a ser verificável sem navegador. `Play.tsx` perdeu 364 linhas.

Piora: a assinatura tem 22 campos. É muita coisa para uma chamada — e é exatamente o acoplamento
que existia antes, agora visível. Um parâmetro que ninguém consegue justificar é um parâmetro que
pode sair; escondido numa closure, não era nem discutível.

**Mudança estrutural declarada:** o material passou a ser calculado no *montar* em vez de dentro do
*aplicar*. Todos os corpos de ramo eram construção de dados pura, exceto um `Math.random` na ordem
das alternativas do "Qual foi?" da trilha — igualmente aleatório nos dois momentos.

**Limite honesto do teste:** ele roda contra a função já extraída, não contra a closure anterior.
Não havia seam — a extração *é* o seam. Quem prova a ausência de regressão de ponta a ponta é o
e2e dos jogos, que joga Memória, Termo e Bao até o fim da rodada nos três viewports.

## O que este ADR não resolve

`aoTerminar` (o funil de fim de rodada) e o acervo da prática continuam no componente. São cadeias
de `useMemo`/`setState` sobre dez ou mais valores locais; movê-las hoje trocaria uma closure por
uma função de doze parâmetros **sem ganhar teste** — o oposto do que esta extração comprou.

## Como isto é cobrado

`tests/rodadaMontagem.test.ts` (25 casos, os oito ramos). O e2e `sessao-de-jogo.e2e.ts` joga três
jogos até o fim nos três viewports. E o teste documenta duas **não-determinações pré-existentes**
que encontrou no caminho: `buildRodadasEscuta`, `buildRodadasDitado` e `buildRodadasConectores`
chamam `embaralhar` **sem semente**, então com mais falas que o teto do jogo até o *conjunto* de
itens varia entre duas montagens idênticas.
