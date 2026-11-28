## Abordagem escolhida (decisão do dono, 27/11/2026)

**Opção 3 do protótipo v4, "O Início é o menu"**, atrás da flag `navegacao_simples` (nasce DESLIGADA, sem regra de plano). Ela
substitui a opção A de `opcoes.md` ("Cinco portas") e a recomendação da auditoria v3 ("Trilho com nome"). Protótipo:
`scratchpad/navegacao-v4/index.html?op=3` (funções `shell3`, `inicioMenu`, `contaHTML`, `avisosHTML`, `buscaHTML`). O protótipo
define só a ESTRUTURA; o visual é o do app (peças e tokens de `quest.css` e `index.css`).

1. **Sem trilho, sem "Mais", sem barra de baixo.** Com a flag, `TrilhoDoQuest` não desenha o trilho nem o painel "Mais"
   (computador e celular); no lugar entra `CabecalhoSimples` (pedaço à parte, que só desce com a flag). As instalações da
   casca (polimento, pré-carga, celular) continuam no mesmo componente, nos dois desenhos. A casca vira coluna
   (`.q-casca[data-nav='simples']`, no CSS inicial, com uma reserva de 64 px para não pular).
2. **O Início é o menu.** `InicioDoQuest` troca os caminhos, a linha de progresso, a de Livros, o selo e o card de planos por
   `InicioMenu` (pedaço à parte): Ao vivo em destaque (bloco grande), Cartões com o número de hoje, Jogar, Livros (com o
   progresso do livro aberto por último, título só para livro trazido pela pessoa), Biblioteca, e na última fileira
   Progresso, Personalizar (a tela de hoje, `loja`) e Planos (duas colunas; para todos: "Seja Premium" em destaque no
   Grátis, sem conta e teste, `veConviteDoPremium`; "Seu plano" com a frase do plano para quem assina). Ajuste do dono de
   28/11/2026. O resto do Início (missões, sessões, avisos, anúncio) fica embaixo. Rótulos por perfil: os de `navItems.ts`.
3. **Cabeçalho fino em toda outra tela**: "‹ Início", o nome da tela (rótulo do perfil), a busca (a global de sempre,
   Ctrl/⌘+K), o sino e o avatar. No Início: a marca, "Buscar ou ir para…" larga, o sino e o avatar.
4. **Ao vivo sem submenu.** O bloco abre direto em `lerUltimaAoVivo()`. O seletor "Legendar | Conversar" (`.q-abas.q-seg`)
   fica no cabeçalho da tela do Ao vivo (dentro da tela, segunda linha no celular), e a "Legenda flutuante" vira botão ali
   quando a captura roda. O último modo é o da última visita, por qualquer porta. `EscolhaAoVivo` só vale sem a flag.
5. **Sino**: abre direto a lista de avisos de sempre (`useListaDeNotificacoes`), com o número de não lidos preso ao sino e no
   nome acessível ("Avisos, N não lidas"). Marcar todas como lidas e Preferências continuam.
6. **Avatar = "Configurações"** (ajuste do dono de 28/11/2026; nome acessível "Configurações e conta"): painel `.q-vivo`
   ancorado (folha de baixo no celular) com Ajustes (com o atalho, só com teclado físico), Seu perfil, Ajuda e suporte,
   Sobre, Diagnóstico (headset), Leituras (flag `leitura_ativa`), Administração (admin), os interruptores Tema escuro, Som
   dos toques e Modo desempenho (`role="switch"`, `.q-interruptor`), o estado da conta ("sessão ativa") e Entrar ou Sair.
   Progresso, Personalizar e Planos saíram dali: estão no Início.
7. **Teclado e foco**: Esc fecha o painel e devolve o foco ao botão que o abriu; no computador o painel não é modal (Ctrl+K e
   Ctrl+, seguem valendo); a folha do celular é modal e prende o Tab.
8. **Sem a barra de baixo no celular**: o palco reserva só o botão do iChat (76 px em vez de 156), e o botão, o selo
   "Salvando…" e a tela do avatar descem para o pé. O anel do polimento em volta do ícone do Ao vivo não vale no bloco.
9. **Rotas**: nenhuma muda. A Voz de leitura sai do primeiro nível (fica em Ajustes › Idiomas, na captura e no leitor).

## Alternativas descartadas

- **Opção A / "Trilho com nome" (auditoria v3)**: 9 alvos no computador, ainda um trilho lateral; o dono preferiu o Início
  como menu.
- **Só consertar os sintomas** (rótulo sempre visível, lembrar a última escolha de Ao vivo): barato, mas não tira o "Mais".

## Método

Sem IA. O protótipo v4 (4 opções, contador de toques) foi a simulação; a opção escolhida vira código atrás da flag, com testes
de componente (flag ligada e desligada) e e2e (desktop-1280 e mobile-375). Em dev: `FLAGS_LIGADAS_NO_DEV=navegacao_simples
npm run dev:local`.
