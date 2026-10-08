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
