> **Origem:** reclamação do dono (backlog "navegação confusa", memória de 20/11/2026): menus e submenus demais, barra lateral
> com cerca de 12 ícones sem rótulo, painel "Mais" com destinos, avisos e atalhos, submenu Legendar x Intérprete, Ajustes muito
> longos. Esta change é de PLANEJAMENTO: o inventário real está em `inventario.md`, as três opções em `opcoes.md`, e nenhuma
> linha de produção muda antes do protótipo aprovado (fatia 1).

## Why

A navegação cresceu por soma de pedidos razoáveis, cada um decidido em separado, e o conjunto ficou pesado. O código mostra a
história (comentários em `src/components/shell/navItems.ts`): Intérprete ganhou porta própria (30/09), Cartões entrou e
Vocabulário saiu (10/10), Ajustes foi para o pé do trilho (23/10), Livros subiu para o menu lateral "não sendo algo
secundário" (27/10), Planos entrou "para o dono achar" (vender-onde-se-ve). Nenhuma decisão estava errada; o somatório é o
problema, e nenhuma regra impede o próximo item.

Números medidos no código (detalhe e linhas em `inventario.md`):

- **Desktop**: o trilho tem até 12 botões de primeiro nível (8 destinos: Início, Ao vivo, Cartões, Jogar, Biblioteca, Livros,
  Progresso, Planos; mais Buscar, Ajustes, Voz de leitura e Mais). Quando a janela é baixa, o modo compacto (`data-compacto`,
  `useTrilhoCompacto`) tira o RÓTULO e deixa só o ícone, que é exatamente a queixa "ícones sem rótulo".
- **Celular**: barra de 5 (Início, Ao vivo, Cartões, Jogar, Mais); Biblioteca, Livros, Progresso, Personalizar, Ajustes, Perfil,
  Ajuda, Sobre e Planos ficam atrás do "Mais".
- **"Mais"** é um diálogo com duas abas (Destinos, Avisos), ladrilhos de destino (Personalizar, Ajustes, Perfil, Ajuda, Sobre, e no celular
  também Biblioteca, Livros e Progresso; mais Leituras, Administração e Diagnóstico quando se aplicam), uma faixa de planos,
  3 a 4 interruptores (tema, som, desempenho, vibração no Quest) e botões de conta.
- **Ao vivo** abre uma escolha (Legendar, Intérprete e, com captura rodando, Legenda flutuante) antes de chegar a qualquer
  tela: um toque a mais em todo uso de captura.
- **Ajustes**: 6 abas (`ABAS_DOS_AJUSTES`: Idiomas, Aparência, Notificações, Processamento, Privacidade, Conta), 9 arquivos de
  tela e cerca de 2,8 mil linhas de componente.
- **Duplicatas**: Planos está no trilho, na faixa do "Mais", no Início e em Ajustes, Conta; Ajustes está no pé do trilho e
  no "Mais"; Progresso (Estatísticas) e a aba Memória de Cartões mostram retenção.
- 23 valores de `ViewType`, 12 itens em `NAV_ITEMS`.

## Para quem

Todo mundo, e principalmente quem não é "do app": criança (perfil kids), pessoa sênior (rótulos longos do perfil `senior`) e o
adulto ocupado que quer legendar um vídeo e rever os cartões em poucos toques.

## What Changes

1. **Medir antes de mexer**: um script de Playwright conta toques e botões de primeiro nível para 7 tarefas, nos três
   tamanhos (desktop, tablet, celular), e vira a linha de base e o teste de regressão.
2. **Protótipo antes de código**: as três opções (`opcoes.md`) viram um protótipo HTML navegável em
   `docs/prototipos/navegacao-simples.html` (no molde dos protótipos aprovados do repo) e o dono escolhe vendo.
3. **A opção escolhida (3, "O Início é o menu"), atrás da flag `navegacao_simples`** (nasce DESLIGADA, sem regra de plano):
   sem trilho, sem "Mais" e sem barra de baixo; o Início é a grade de destinos (Ao vivo em destaque, abrindo no último modo;
   Cartões com o número do dia; Jogar; Livros com progresso; Biblioteca; Progresso; "Seja Premium" só para quem não assina);
   nas outras telas, um cabeçalho fino com "‹ Início", o nome, a busca, o sino (avisos direto) e o avatar ("Configurações"). O
   seletor "Legendar | Conversar" fica dentro da tela do Ao vivo.
4. **Um orçamento de navegação** escrito (spec): máximo de itens por nível e a regra "item novo entra tirando outro".

Nenhuma rota some: todos os endereços atuais continuam valendo (`src/lib/rotas.ts`, matriz rota-guarda).

## Fora de escopo

- Reescrever telas por dentro (Cartões, Jogar, Biblioteca): só o que as liga (casca, abas de topo e cabeçalhos).
- Mudar o visual do tema (isso é `polimento-movimento`); esta change só decide O QUE aparece e ONDE.
- Remover funcionalidades ou destinos; tudo continua alcançável.
- A busca global (Ctrl+K) muda só de lugar, não de comportamento.
- A administração do dono (`/admin`) e o Diagnóstico: continuam onde estão (dentro de "Você").

## Delta sobre o que já existe

- `polimento-movimento` (#11): tem 7.1 "barra flutuante de cinco destinos" e 6.1 "Planos fácil de achar". Esta change
  DECIDE o conteúdo dessa barra; a mudança de aparência segue lá. Coordenar para não decidir a barra duas vezes.
- `cartoes` (#15): 9.x "Mapa das portas" (busca ampliada, Tutor e idioma no "Mais", portas plantadas). As portas plantadas
  vão para "Você"; atualizar a 9.3 depois da escolha.
- `tela-de-jogos-v2` (#17) e `polimento-movimento` mexem em `Play.tsx`: a mudança aqui não toca o corpo da tela.
- Decisões anteriores do dono que esta change pode REVERTER e por isso pedem OK explícito (ver Decisões): Livros no trilho
  (27/10), Ajustes à mão (23/10), Intérprete com porta própria (30/09), "navegação A no computador, Praticar no celular"
  (10/10), Planos no menu (vender-onde-se-ve).
- Não há change ativa ou arquivada de "navegação simples" (conferido em `openspec/changes` e `archive`).

## Riscos

| Risco                                                              | Mitigação                                                                                                                         |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Reverter pedido recente do dono (Livros, Intérprete, Ajustes)      | Decisões explícitas antes da fatia 3; o protótipo mostra onde cada um fica                                                        |
| Esconder demais e baixar a descoberta de Planos                    | Planos mantém atalho em Você, no Início e na faixa de teste; medir cliques em Planos (já existe `metricasOfertas`) antes e depois |
| Conflito de arquivo com `polimento-movimento` e `tela-de-jogos-v2` | Rodar sozinha, depois de `tela-de-jogos-v2` ou combinando a ordem; o trabalho está na casca (`TrilhoDoQuest.tsx`, 938 linhas)     |
| Quebrar links, favoritos e a busca                                 | Matriz rota-guarda e teste de que cada `ViewType` abre pelo endereço de hoje                                                      |
| Perfil sênior e kids perdem rótulos próprios                       | `labels` por perfil continuam em `navItems.ts`; o teste de rótulo cobre os três perfis                                            |
| Tablets e Quest (headset) com padrões próprios                     | O protótipo cobre os 4 formatos; Quest só na fatia final **[R]**                                                                  |

## Critérios de aceite (mensuráveis)

As 7 tarefas medidas: **T1** legendar o que estou assistindo; **T2** conversar com alguém (Intérprete); **T3** rever os
cartões de hoje; **T4** jogar; **T5** ver meu progresso; **T6** trocar o idioma de legenda; **T7** abrir um livro.

| Critério                                                             | Hoje (estimado pelo código; a linha de base real é a tarefa 1.1) | Meta                                                                           |
| -------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Itens de primeiro nível, celular                                     | 5                                                                | 5 (mantém)                                                                     |
| Itens de primeiro nível, desktop e tablet                            | até 12                                                           | 5 destinos + Buscar (6)                                                        |
| Itens de primeiro nível sem rótulo visível, em altura >= 600 px      | quase todos quando o trilho compacta                             | 0                                                                              |
| Diálogos ou painéis entre a tela e qualquer destino principal        | 2 ("Mais", escolha Ao vivo)                                      | 0                                                                              |
| Toques até T1 (a partir do Início, depois de iniciar)                | 3                                                                | <= 2 com o último modo lembrado                                                |
| Toques até T2                                                        | 3                                                                | <= 2                                                                           |
| Toques até T3                                                        | 2                                                                | <= 2                                                                           |
| Toques até T4                                                        | 2                                                                | <= 2                                                                           |
| Toques até T5                                                        | 1 no desktop, 2 no celular                                       | <= 2 nos dois (o Início mostra o resumo)                                       |
| Toques até T6                                                        | 2 no desktop, 3 no celular                                       | <= 3 nos dois                                                                  |
| Toques até T7                                                        | 2 no desktop (Livros) e 3 no celular                             | <= 3 nos dois (custo aceito da opção A; a Biblioteca abre na última aba usada) |
| Abas por destino (segundo nível)                                     | Ajustes 6, Personalizar 5, Sessão 4, Cartões 3                   | <= 5 em todas; Ajustes com 5 e até 8 itens visíveis antes de "Mostrar mais"    |
| Destinos de `ViewType` alcançáveis em <= 3 toques a partir do Início | a medir                                                          | 100%                                                                           |
| Sucesso sem ajuda em teste com 5 pessoas, 7 tarefas                  | a medir                                                          | >= 90% das tarefas, e 0 pessoas "perdidas" por mais de 20 s                    |
| Rótulo acessível igual ao visível (WCAG 2.5.3), alvo >= 44 px        | a medir                                                          | 100%                                                                           |
| URLs existentes que ainda abrem a tela certa                         | todas                                                            | todas                                                                          |

## Custo e esforço

Sem custo de IA nem de servidor (a flag é de interface). **G**: 3 a 4 semanas no total (medir 2 dias; protótipo 3 a 4 dias;
casca e Você 1 semana; Ajustes 1 semana; Ao vivo e fechamento 1 semana), com decisões do dono entre as fatias.

## Decisões do dono (com recomendação; todas juntas, antes da fatia 2)

1. **Qual opção?** Recomendo A ("Cinco portas") com B de reserva; escolha final depois do protótipo (tarefa 2.4).
2. **Livros no primeiro nível** (pedido de 27/10): recomendo mover para aba de Biblioteca, com atalho no Início; alternativa: Livros fica e Biblioteca vira aba dele.
3. **Planos fora do primeiro nível** (decisão vender-onde-se-ve): recomendo mover para "Você" e manter a faixa do Início, com a medição de cliques como trava; reverter se os cliques em Planos caírem mais de 20% na rampa.
4. **Intérprete sem porta própria** (30/09): recomendo o seletor dentro de Ao vivo.
5. **Ajustes à mão no trilho** (23/10): recomendo "Você" como casa dos Ajustes.
6. **Medir uso por agregado** para saber quais destinos quase ninguém abre: recomendo sim, contagem sem identificação (precisa de parecer, como `rum_latencia`); sem ela a decisão fica só pelas 5 pessoas do teste.
