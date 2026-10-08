# O que o desenho antigo tinha e o protótipo não mostra

Regra do dono (08/10/2026): o protótipo manda na tela. O que existe na versão antiga e não aparece no
protótipo **não é portado**; fica anotado aqui, para ele decidir depois o que volta. O que não se vê
(gravação, nota de revisão, atalhos de teclado) continua funcionando por baixo.

| Tela | O que ficou de fora | Onde estava | O que fazia |
|---|---|---|---|
| Menu lateral | Biblioteca e Vocabulário a um toque | `TrilhoDoQuest.tsx` (`NO_TRILHO`, pedido de 02/10) | Abriam direto; agora estão no painel "Mais" |
| Início | Selo "N dias seguidos" no alto | `InicioDoQuest.tsx` | Mostrava a ofensiva; a frase continua na linha do progresso |
| Início | Cartão "Vocabulário" como segundo caminho | `InicioDoQuest.tsx` | Levava ao Vocabulário quando não havia nada para revisar; agora é "Conversar" |
| Jogos | Botão "Pausar" na tela | `casca/CascaDaRodada.tsx` | Pausava a rodada; a pausa continua por Esc e P |
| Jogos | Passo a passo guiado da primeira partida | `TourGuiado.tsx` | Apontava as peças uma a uma; deu lugar à explicação em três telas |
| Jogos | Contagem 3-2-1 antes da rodada (menos no Duelo) | `casca/CascaDaRodada.tsx` | Preparava a largada |
| Rali | Aceitar sinônimo como resposta | `TenseTennisGame.tsx` | Valia outra palavra de mesmo sentido |
