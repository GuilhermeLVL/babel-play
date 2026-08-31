## Context

`estadoDaColecao` (`progressao.ts:63-77`) já é a fonte única de verdade — o problema é 100%%
de apresentação: cada aba inventou um chrome. A etapa 1 existe porque escolher direção de
design sem ver custa retrabalho; o protótipo usa dados reais do catálogo para a avaliação ser
honesta.

## Decisão do dono (31/08, 2ª rodada de protótipo)

Não é uma direção só: é a JUNÇÃO das três, em 4 áreas com um card/raridade únicos:

1. **Passe** (de A): 100 níveis, 2 recompensas por nível, TRILHA DUPLA — Grátis para todos e
   Premium comprável em Créditos que DEVOLVE mais créditos do que custa ao longo da trilha
   (modelo Fortnite: quem completa recompra o próximo ou gasta na Loja). Os itens do catálogo
   atual (nível 1-10) viram os marcos ★ de dezena; o meio devolve moeda e impulsos. "Temporada"
   nomeia capítulo — nada ganho expira.
2. **Biblioteca** (de B/C): só o que é do usuário; é onde ele monta o visual (equipar por
   categoria, resumo vivo do equipado).
3. **Loja**: vitrine ROTATIVA — prateleira de atalhos em Seeds + prateleira de exclusivos em
   Créditos; o destaque pode apontar para um Desafio (exclusividade que não se compra).
4. **Desafios**: recompensa EXCLUSIVA por minijogo, com desafios das métricas que o app já grava
   (tempo por item, attempts, hinted, estrelas, frequência, rodadas perfeitas) — completar os
   desafios do jogo libera o item dele. As conquistas gerais atuais mantêm o mesmo formato.

Implicação de economia: o Passe Premium pago depende da moeda comprada — implementação fica
ATRÁS da spec `economia-de-creditos` (inventário server-side primeiro). A etapa 2 desta mudança
implementa as 4 áreas com a economia ATUAL (Seeds + nível + conquistas); a fileira Premium entra
desenhada mas desativada até a economia de créditos existir.
