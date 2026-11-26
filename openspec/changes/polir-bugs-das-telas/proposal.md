## Why

O dono mandou cinco capturas (26/11) com sobreposições e acabamento quebrado: o player da escuta guiada cobrindo a
transcrição, as abas de "Palavras desta sessão" sobre o primeiro item, o iChat com o selo "Context" em inglês e por cima
da barra do trecho do leitor, "Explicar" e "Perguntar" com borda tracejada, e o cartão da palavra com os botões soltos.
O desenho, as cores e a navegação ficam como estão: é correção e polimento dentro dele.

## What Changes

- **Player da sessão**: a escuta guiada vira um cartão compacto (não a pílula de 999 px), com rótulos alinhados; no
  celular a altura do player é medida (`--px-player-h`), o fim da tela reserva esse espaço e o iChat sobe para acima dele.
- **Palavras desta sessão**: a lista em grade passa a ter linhas da altura do conteúdo (as abas deixam de ser
  espremidas); no celular as quatro abas ficam em 2 × 2.
- **iChat**: o selo "Context" passa por i18n ("Contexto"). Sai de cena enquanto a barra do trecho ou um painel do leitor
  (IA, Sumário, Aparência, Anotações, Narração) está aberto, como já saía com o narrador e a folha da palavra.
- **Barra do trecho**: "Explicar" e "Perguntar" indisponíveis perdem a borda tracejada (ficam mais apagados, com a dica
  e o motivo ao tocar); respiro maior; a citação do topo trunca em 2 linhas.
- **Cartão da palavra (leitor)**: o principal (Salvar, Já sei, Ignorar) numa fileira, com "Salvar" em destaque; traduzir a
  frase, sentido e "Mais" na fileira de baixo. "Salva" deixa de ser tracejado.

## Impact

CSS, `PlayerInterativo`, `CartaoDaPalavra`, `IChat` e `public/i18n/en.json`. Sem mudança de dados nem de servidor.
Teste: `tests/e2e/polimento-das-telas.e2e.ts` (mede as caixas, computador e celular).
