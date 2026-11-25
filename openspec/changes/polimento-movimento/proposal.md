## Why

O desenho novo funciona, mas é parado: a tela troca de uma vez, as abas pulam, os painéis aparecem
sem dizer de onde vieram, e no celular não há nem som nem vibração no toque. Entre 07/10 e 08/10 o
dono aprovou, em dezesseis rodadas de protótipo (`docs/prototipos/polimento-movimento.html`, clone
do desenho novo de produção com uma camada por cima), como o app deve se mexer, soar e responder ao
toque, e como os jogos devem ser jogados sem frustração.

O protótipo é um arquivo HTML. Esta mudança leva o que foi aprovado para o app, por fases, cada uma
entregável sozinha.

Três coisas o protótipo provou e o app não tem:

- **Movimento com física**: molas de verdade, painéis que nascem do botão que os abriu e seguem o
  dedo, listas que entram em cascata. Hoje há duas curvas (`src/index.css:155-156`) e a regra do
  headset, "120 a 180 ms, no lugar" (`docs/design/quest-desenho.md:60`).
- **Os sentidos juntos**: som, vibração e imagem no mesmo instante; no celular, o giroscópio no
  lugar do ponteiro. Hoje o celular não vibra no toque e não existe leitura de giroscópio.
- **Jogos sem frustração**: níveis que mudam a REGRA (hoje a faixa só escolhe as palavras, e só o
  Termo muda de regra: `src/core/minigames/termo.ts:235`), ajudas gerais, explicação antes da
  primeira partida que dá para rever (hoje o tour não tem como ser reaberto pela interface), e o
  erro que se limpa sozinho.

## What Changes

Por fases; a ordem é a de menor risco para maior, e cada fase termina com o app publicável.

- **Fase 0 — Fundação** (esta entrega): as curvas e a física (`src/lib/movimento/mola.ts`), a regra
  de onde o movimento rico vale e a porta única para animar (`src/lib/movimento/animar.ts`), a
  inclinação do aparelho (`src/lib/dispositivo/inclinacao.ts`), o tato no celular
  (`src/lib/dispositivo/tato.ts`) e os tokens no CSS (`src/styles/questMovimento.css`). Nada muda
  na tela ainda.
- **Fase 1 — A casca se mexe**: pílula deslizante nas abas, troca de tela com saída e entrada,
  painel "Mais" e diálogos que nascem do botão e seguem o dedo, aviso que se arrasta para fora,
  troca de tema em círculo, som e tato nos toques.
- **Fase 2 — Jogar sem frustração**: níveis por jogo que mudam a regra, "+10 s" e "Ver resposta",
  aviso depois de dois erros, explicação em três telas na primeira vez e a pedido, erro que se
  limpa sozinho, tela de fim que sugere o nível.
- **Fase 3 — Miniaturas**: o cartão de cada jogo ganha a cena que mostra a mecânica
  (`ArteDosJogos.tsx` existe e não é usado no lobby novo).
- **Fase 4 — Rali e Mala com cara de jogo**: a quadra e a mala.
- **Fase 5 — Tema Água**: tema novo com a cena viva e o giroscópio.
- **Fase 6 — Telas**: Planos fácil de achar, Personalizar, Loja e passe, a Sessão com o player,
  o Intérprete no claro, Capturar e Intérprete entrando direto na tela de uso.
- **Fase 7 — O desenho novo no celular**: a barra flutuante, as folhas de baixo, os carrosséis.
  É a maior e a última: hoje o desenho novo nunca liga no celular
  (`tests/desenhoNovoNoComputador.test.ts:53`).

## Impact

- **Regra do desenho novo**: `docs/design/quest-desenho.md` passa a ter duas faixas de movimento, a
  contida (headset, modo leve, movimento reduzido) e a rica (o resto).
- **Orçamento do CSS inicial** (55 KB gzip, `scripts/perf/suite/slo.json`): todo CSS novo chega com
  a tela que o usa, nunca por `main.tsx`.
- **Testes que fixam regra de jogo** mudam junto com a regra, no mesmo commit (por exemplo o saque
  do Tênis em `tests/questJogos.test.tsx`).
- **`tests/temas-v2.test.ts`** exige fundo de tema em CSS puro; o tema Água usa canvas para a
  superfície. A fase 5 decide: ou a regra ganha a exceção escrita, ou a superfície vira CSS.
- **Traduções**: todo texto novo passa por `t()` e entra em `public/i18n/en.json` na mesma fase.
- Sem migração de banco, sem rota nova, sem dependência nova.

## Revisão de 25/11/2026

**Estado:** precisa decisão do dono, depois de uma reconciliação curta de documentos. O código foi bem além do que o `tasks.md` dizia:
fases 0 a 4 (fundação, casca, jogar sem frustração, miniaturas, Rali e Mala), 5 (tema Água), 6 (telas) e 7 (desenho novo no celular)
estão no repositório com testes (`src/lib/polimento/*`, 23 arquivos `tests/polimento*.test.*`, `polimentoCelular.css`). O desenho novo
é o único (`fidelidade/apagar-o-legado.md`). O que sobra é: reconciliar `fidelidade/estado.md` (parou em 10/10 e ainda lista blocos
como abertos), conferir o padrão do "reduzir movimento" do sistema (8.5), e as aprovações do dono (aparência do tema e da barra de cinco).

**O que ficou velho:**

- `tasks.md` (fases 5 a 7 marcadas como abertas) e `estado.md` (blocos C, E, F e "18 cenas: 1 de 18") descrevem 10/10. Atualizados nas
  tarefas; o `estado.md` precisa da tabela item a item (8.1).
- **"Premium"** nos textos de planos e no aviso do intérprete (6.1, 6.4): a v4 vende o Plus.
- **A chave do desenho novo** não existe mais; a spec "O movimento rico tem chave própria" fala da chave do movimento (`data-movimento`),
  que continua, e não da do desenho.
- **Risco de acessibilidade** a confirmar (8.5): a camada ignora `prefers-reduced-motion` enquanto as animações do app estão ligadas;
  o público inclui menores e pessoas sensíveis a movimento. A spec ganhou o cenário que o proíbe por padrão.
- **#205 e #206** mudaram a captura no celular (legenda primeiro, avisos numa área que rola): a passada 7.3 deve incluí-los.

**Esforço:** M (8.1 a 8.5 e a passada 7.3 [R]; sem código novo de movimento). **Valor para quem usa:** médio (sensação de qualidade e
jogos menos frustrantes); baixo para a conversão; alto só se o 8.5 achar um defeito.

**Dependências e conflitos:** mexe em muitos componentes; rodar sozinha (README). Conflita com `tela-de-jogos-v2` (#17, `Play.tsx`) e
com `motor-anki-jogos` (`Play.tsx`); toca a tela de Planos (planos v4) e a conversa do desenho novo (`interprete-conversa-virtual`).
Sem migração, sem rota, sem dependência nova, sem custo de IA.

**Decisões do dono:**

1. Aprovar a aparência do tema Água e da barra flutuante de cinco: (a) aprovar pelas capturas lado a lado; (b) pedir ajustes;
   (c) aprovar só no computador e adiar o celular. **Recomendo (a) depois de anexadas as capturas lado a lado** (tarefa 7.3 e 5.4).
2. `temas-v2` (5.3 do README): (a) manter a exceção cercada do canvas do Água; (b) trocar a superfície por CSS puro; (c) tirar o Água.
   **Recomendo (a)**: já está feito e testado; (b) só se o desempenho no celular reprovar.
3. "Reduzir movimento" do sistema: (a) respeitar por padrão e deixar o interruptor Animações do app como escolha explícita de quem
   quer mais; (b) manter como está (o app decide); (c) respeitar sempre. **Recomendo (a)**: protege quem pediu menos movimento e
   mantém o protótipo para quem liga de propósito.
4. Arquivar a change depois do 8.1: (a) arquivar e abrir changes pequenas para o que o `estado.md` ainda listar; (b) manter viva.
   **Recomendo (a)**.
