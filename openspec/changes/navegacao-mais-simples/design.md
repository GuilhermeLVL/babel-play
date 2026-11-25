## Abordagem escolhida

Opção A de `opcoes.md` ("Cinco portas"), com B como reserva, entregue por fatias e atrás da flag `navegacao_simples`.

1. **Uma fonte da navegação, com orçamento.** `navItems.ts` ganha o campo `nivel: 1 | 2` e uma constante
   `ORCAMENTO_DE_NAVEGACAO = { primeiroNivel: 5, abasPorDestino: 5 }`. Um teste de unidade falha se um item novo estoura o
   teto. É a parte que impede o problema de voltar.
2. **A casca é uma só.** `TrilhoDoQuest.tsx` (938 linhas) é dividido: o trilho e a barra leem a mesma lista de 5 destinos; o
   "Mais" deixa de ser diálogo e vira a rota `/voce` (nova `ViewType`), com as seções Progresso, Personalizar, Planos,
   Ajustes, Perfil, Ajuda, Sobre, Avisos e Aparência rápida (tema e som). `/estatisticas`, `/loja`, `/planos`, `/ajustes`,
   `/perfil`, `/ajuda`, `/sobre` continuam valendo (rotas e links atuais).
3. **Rótulo sempre visível.** O modo compacto por altura (`useTrilhoCompacto`) deixa de esconder o texto: com 5 itens o
   trilho cabe em 600 px. Abaixo disso o trilho rola. O nome acessível é igual ao rótulo (WCAG 2.5.3).
4. **Ao vivo sem submenu.** `EscolhaAoVivo` sai da navegação; a tela de captura abre com o seletor "Legendar | Conversar"
   (o último modo vem de `lerUltimaAoVivo`) e "Legenda flutuante" vira botão da própria captura. `/interprete` e
   `/capturar` continuam endereços.
5. **Praticar e Biblioteca como destinos com abas.** `AbasDePraticar` passa a valer também no computador; "Biblioteca" ganha
   a aba "Livros" (e "Leituras" com a flag).
6. **Ajustes mais curtos**: "Mais usados" no alto (idioma, tamanho do texto, tema, notificações, voz), grupos recolhidos por
   padrão, busca ("Procurar um ajuste"), e as 6 abas se reduzem a 5 (Conta e Privacidade juntas ou "Conta" levada a "Você").
   A decisão final é do protótipo (tarefa 2.3).
7. **Flag e reversão**: com `navegacao_simples` desligada nada muda; a antiga casca fica até a flag chegar a 100% e um ciclo
   de estabilidade, então é removida (tarefa 6.2).

## Alternativa descartada

**Só consertar os sintomas** (rótulo sempre visível, lembrar a última escolha de Ao vivo, tirar Planos duplicado), sem mexer
nos destinos. É barato e dá ganho imediato, e está dentro da fatia 0 da proposta; mas não resolve o fato de haver 12 portas
nem impede o próximo item: as queixas "menus demais" e "Mais com tudo dentro" voltariam em dois meses. Entra como fatia 0 e
não como a solução.

## Método (sem IA, sem latência de modelo)

Não há medição de qualidade de modelo. O que vale do `ciclo-rapido` aqui: decisões do dono combinadas no início (as 5 da
proposta, de uma vez), simular antes de construir (protótipo HTML estático com as três opções e um contador de toques), triagem
curta (5 pessoas, 7 tarefas, 20 minutos cada, parada antecipada se a opção A errar mais que a atual em duas tarefas), e só a
finalista vira código. Pré-voo: o teste de alcançabilidade de rotas roda antes de cada fatia.
