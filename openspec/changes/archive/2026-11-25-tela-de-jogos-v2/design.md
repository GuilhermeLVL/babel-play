## Context

Auditoria em `docs/auditoria/tela-de-jogos-v1.md`; protótipo em `docs/prototipos/jogos-redesign.html`.
Os códigos `F01…F49` referenciam achados daquele documento.

Três restrições que o desenho respeita, porque o projeto já pagou por elas:

1. **`FonteId` não pode ser renomeado.** `exercise_results.origem` é derivado dele; renomear orfanaria
   todo o histórico (`source.ts:161-169`). O vocabulário da tela (`OrigemDaPratica`) já existe como
   camada de tradução — é ele que muda, não o `FonteId`.
2. **Nenhuma prévia pode revelar a resposta.** Tudo passa por `previaSegura` / `REVELAVEL`
   (`core/minigames/revelavel.ts`), que **lança erro** para um jogo ausente da tabela. A folha de
   detalhe entra pelo mesmo funil.
3. **A ordem das cartas é do usuário e é persistida** (`babel.jogos_ordem`), e `proximaRodada` é
   derivada dela. Mudar a grade sem passar por `aplicarOrdem` quebra também o card "Continuar".

## Decisões

### A cor dos jogos vira sistema, não decoração

Hoje as 9 artes dividem 3 cores por acidente, e a regra "nenhuma cor literal" — que existe para
proteger os 7 temas e está certa — deixou tudo indistinguível (F15, F16). A saída **não** é liberar
cores literais: é dar significado às três que já existem.

Cor = **família do jogo** (`--accent` palavra · `--good` frase · `--rare` escuta), silhueta = o jogo.
A regra dos temas continua intacta, e a grade ganha uma legenda de três palavras.

Consequência assumida: o ícone pixel sai da carta. Hoje cada carta mostra **duas metáforas diferentes
do mesmo jogo a 10px de distância** (F17); ficam a arte e o nome.

### Um clique até jogar é troca de default, não construção

A verificação adversarial refutou a proposta ingênua: a Sala **não** abre sempre (só com mais de uma
fonte, `Play.tsx:1910`), e as duas saídas de volta já existem. O que falta:

- `salaAberta` passa a nascer `false` quando há fonte guardada que rende rodada;
- `pularSempre` passa a nascer `true`;
- **pré-requisito**: `Play.tsx:972-985` retorna antes de `lerFonteGuardada` quando `!sessoes.length`.
  Sem consertar isso, abrir direto no lobby entrega o oposto do prometido — uma rodada de zero
  decisão **na fonte errada**, e sem a Sala para denunciar a troca.

### A folha de detalhe substitui duas superfícies

`ComoSeJoga` tem 1.203 palavras, 28% delas repetindo o tour (F36); a antessala é uma tela cheia com
quatro tiles dos quais três costumam ser "0" (F40). Viram uma folha só: nome, o que treina em uma
linha, os fatos **diferentes de zero**, e dois `<details>` fechados. `Começar` e `Trocar os itens`
continuam existindo.

O que **não** pode se perder e precisa achar casa: os chips de faixa e estratégia, a rodada de
resgate, o mapa de fases, e o painel de progressão por jogo — hoje a melhor superfície de progressão
do subsistema é opcional e pode ser desligada para sempre (F33).

### Trilhas em outros idiomas: faixas por frequência, ditas como tal

CEFR-J é inglês-only; Goethe e Cervantes não têm licença aberta. As faixas dos idiomas novos vêm de
frequência de uso (OpenSubtitles, CC BY-SA 4.0) e **são rotuladas como frequência**. O seletor passa a
ter dois vocabulários: `A1…C2` para inglês (medido) e faixas para o resto (derivado).

Rotular igual seria afirmar o que o app não sabe — e o projeto já recusou esse atalho uma vez, em
`cefr.ts`, hoje `@deprecated` porque estimava nível por comprimento de palavra e 98,4% dos cartões
saíam com confiança abaixo de 0,5.

A estrutura passa a registrar o **idioma nativo**: a trilha é "inglês para quem fala português", não
"inglês" (F26).

### Rodada mista tem pré-requisitos duros

`MinigameItem.lang` já promete decidir voz e teclado, e está **morto** em 4 dos jogos de palavra
(`types.ts:25-38`). É por ele que a mistura entra, sem tipo novo. Mas antes:

- `normalizarPalavra` só aceita A–Z → grade **vazia** em ru/el/ja/zh/ar/he (`wordsearch.ts:55-57`);
- o teclado do Termo é QWERTY latino fixo (`TermoGame.tsx:42`);
- o TTS cai em `en-US` quando o cartão não tem `srcLang` (`tts.ts:237`);
- o Duelo **entrega a resposta pelo idioma** numa rodada mista — regressão de um bug que o projeto já
  consertou e documentou (`source.ts:17`).

Japonês, chinês e coreano ficam **bloqueados** até `Intl.Segmenter`: sem espaço entre palavras, toda
frase conta como uma só e os cinco jogos de frase morrem inteiros.

## Riscos

- **Mexer em `Play.tsx` é mexer numa máquina de 16 ramos.** O lobby é o último `return`; 14 telas
  cheias vêm antes, como early returns. O redesenho toca o lobby e a folha, não a cascata.
- **Os `min-h` mágicos anti-CLS** (`:2044`, `:2101`, `:2133`, `:2252`, `:2004`) foram medidos e
  comentados. Qualquer refatoração precisa reproduzi-los ou substituí-los por conteúdo de altura
  estável — senão a tela volta a pular durante o carregamento.
- **Checklist anti-regressão é obrigatório**: cada controle do inventário (C1–C23 do lobby, S1–S9 da
  Sala, A1–A12 da antessala, R1–R5 da raspadinha, U1–U4 do resumo) marcado como mantido, movido ou
  removido **com motivo escrito**. A tela acumulou recursos reais em cima de mobiliário ruim; jogar
  fora o mobiliário não pode levar o recurso junto.
