## Context

A fonte é o protótipo `docs/prototipos/polimento-movimento.html` (um arquivo só, gerado; o botão
"Auditoria" dele lista cada mudança em Antes / Depois / Por quê, rodadas 1 a 16). O dono aprovou rodada a rodada e, em 08/10/2026, pediu
que tudo fosse para o app "de forma metodológica".

O protótipo foi feito para ser VISTO, e por isso exagera: ignora "reduzir movimento" por padrão,
anima em tela de uso diário, usa desfoque de fundo à vontade. O app tem regras que o protótipo não
tinha, e elas vencem.

## Decisões

### 1. O movimento rico é uma camada com chave própria

O desenho novo nasceu no headset com a regra "120 a 180 ms, no lugar; nenhum com movimento
reduzido". Ela continua valendo ONDE nasceu. `movimentoRico()` só é verdadeiro quando o aparelho
não é o headset, não está no modo leve (`reduzirEfeitos()`) e a pessoa não pediu menos movimento
(`movimentoReduzido()`). O CSS lê `<html data-movimento="rico|contido">`.

Por que marca no `<html>` e não media query: são três sinais (aparelho, modo leve, preferência), dois
deles só existem em JS. Uma marca única evita que cada folha de estilo repita a conta, e deixa o
teste simples: sem a marca, nada da camada se aplica.

### 2. Uma porta para animar por código

`animar(el, quadros, opcoes)` devolve `null` e não toca no elemento quando o movimento rico não
vale. Quem chama aplica o estado final ANTES e anima a partir de onde estava (padrão FLIP); assim
"não animar" é só chegar lá na hora, sem ramo `if` em cada chamada.

Só `transform`, `opacity`, `filter` e `clip-path`. Nada de animar `width`, `height`, `top` ou
variável CSS herdada (recalcula a árvore inteira).

### 3. O que o protótipo exagerou fica de fora

A lista "O que cortar antes de levar para o app" do painel de Auditoria é parte do escopo:

- nada anima em ação disparada por teclado (busca com Ctrl K, atalhos): abre na hora;
- a cascata de entrada das listas vale na primeira visita da tela, não a cada volta;
- inclinação 3D e luz que segue o ponteiro só em cartão que é botão, uma por vez;
- desfoque de fundo só em painel que flutua, nunca em lista inteira.

### 4. Jogos: a regra muda no núcleo, a cena muda na tela

Os níveis (Fácil, Médio, Difícil) mexem em tempo, vidas, alternativas e ajudas. Esses números hoje
estão espalhados em constantes por `ageProfile` dentro de cada componente
(`KarutaGame.tsx:34`, `TabooGame.tsx:35`…). A fase 2 os reúne numa tabela em
`src/core/minigames/` (sem DOM, testável), multiplicada pelo nível; o componente só lê.

O nível é por jogo e fica no aparelho. Não vai para o relatório da rodada nem para a nota de
revisão: errar no Difícil e errar no Fácil ensinam a mesma coisa sobre a palavra.

"Ver resposta" marca o item como `hinted` (nota 2, sem bônus), não como `revealed`: a pessoa ainda
responde. "+10 s" é de graça.

### 5. Cada fase passa pelos mesmos portões

Por fase: `typecheck`, `lint`, os testes dos arquivos tocados e os transversais da área
(`questCasca`, `questJogos`, `questJogarTelas`, `lobbyDoQuest`, `temas-v2`…), `build`, e os e2e da
área quando a marcação muda. A suíte inteira roda na CI.

Trabalho na branch `feat/polimento-movimento`, um commit por fase (ou por jogo, na fase 2).

## Riscos

- **A pílula das abas e os painéis medem o DOM.** Medir depois de trocar de aba custa um layout;
  feito errado, treme. Mitigação: medir uma vez por troca, animar só `transform`.
- **A fase 2 toca 18 jogos e ~150 testes que fixam marcação.** Mitigação: um jogo por commit, com
  os testes dele; a tabela de regras entra primeiro, sem mudar valor nenhum no Médio.
- **A explicação nova convive com o tour.** Os e2e pré-gravam `babel_tour_<jogo>='1'`. A explicação
  usa a MESMA chave, para não abrir por cima nos testes nem duas vezes para quem já viu o tour.
- **O tema Água pesa** (desfoque de fundo e canvas). Mitigação: sem a cena no modo leve; só as cores.
- **O celular (fase 7) muda a navegação de todo mundo que usa o app no telefone.** Entra atrás de
  chave, como o computador entrou (`babel.desenhoNovo`), e só vira padrão por decisão do dono.

## Fora do escopo

- Ilustração desenhada à mão para as miniaturas (o protótipo usa HTML e CSS; fica assim).
- Nota de pronúncia de verdade no Karaokê do protótipo (o app já tem a dele).
- Publicar: quem roda o deploy é o dono.
