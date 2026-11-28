Legenda: **[D]** depende do dono; **[R]** pede aparelho real. Decisão do dono de 27/11/2026: **opção 3, "O Início é o menu"**
(protótipo v4), atrás da flag `navegacao_simples`. As tarefas da opção A antigas (página `/voce`, orçamento de 5 destinos no
trilho, abas de Praticar) saíram do escopo.

## 0. Flag

- [x] 0.1 Flag `navegacao_simples`: `FLAG_NAVEGACAO_SIMPLES` em `src/core/planos.ts`, semente PG 0048 e SQLite 0087 (journal e
      snapshot encadeados), `PainelFlags.tsx`, `docs/flags.md`, contagem em `tests/integration/schema-pg-baseline.test.ts`.
      Verificar: `tests/navegacao-simples-flag.test.ts`, `npm run migracoes:conferir`.
- [x] 0.2 Em dev: `FLAGS_LIGADAS_NO_DEV=navegacao_simples npm run dev:local` liga a flag (`scripts/subir-dev.mjs`).

## 1. A casca

- [x] 1.1 Com a flag: sem trilho, sem "Mais", sem barra de baixo; `CabecalhoSimples` (pedaço à parte) no lugar, a casca em
      coluna com reserva de altura. Desligada: nada muda.
      Verificar: `tests/navegacaoSimples.test.tsx` (ligada e desligada); e2e `navegacao-simples.e2e.ts`.
- [x] 1.2 Cabeçalho fino: "‹ Início", nome da tela por perfil, busca (Ctrl/⌘+K), sino, avatar; no Início, marca e busca larga.
- [x] 1.3 Sino: lista de avisos direto, número preso ao sino, Esc devolve o foco.
- [x] 1.4 Avatar: menu da conta (Progresso, Personalizar, Ajustes, Seu perfil, Ajuda e suporte, Sobre, Planos/"Seu plano",
      Administração para admin, Leituras e Diagnóstico quando se aplicam, interruptores `role=switch`, estado da conta, Sair);
      folha de baixo no celular; Esc devolve o foco; Ctrl+, abre Ajustes.

## 2. O Início é o menu

- [x] 2.1 `InicioMenu` (pedaço à parte): Ao vivo em destaque, Cartões com o número de hoje, Jogar, Livros com progresso,
      Biblioteca, Progresso, "Seja Premium" só para Grátis, sem conta e teste. Rótulos por perfil.
      Verificar: `tests/navegacaoSimples.test.tsx`.
- [x] 2.2 Ao vivo abre no último modo em 1 toque; o seletor "Legendar | Conversar" mora na tela do Ao vivo.
      Verificar: e2e (desktop-1280 e mobile-375).
- [x] 2.3 i18n dos textos novos em `en`, `es`, `ar` e `npm run i18n`.

## 3. Rampa e remoção

- [ ] 3.1 **[D][R]** Ligar só para o dono por uma semana (computador e celular); depois rampa olhando cliques em Planos
      (`metricasOfertas`) e a abertura de Cartões e do Ao vivo.
- [ ] 3.2 **[R]** Conferir no Quest e no celular real (o cabeçalho no headset, a folha da conta no celular com teclado virtual).
- [ ] 3.3 Matriz de alcançabilidade (todo `ViewType` em <= 3 toques do Início, com a flag) como teste de CI.
- [ ] 3.4 Remover o trilho, o "Mais" e `EscolhaAoVivo` depois de um ciclo estável em 100%.
      Verificar: `npx knip` sem arquivo sem uso; testes e e2e verdes.

## Fora desta change

- Ajustes mais curtos ("Mais usados", grupos, busca de ajuste) e o orçamento de abas: ficam para uma change própria, depois
  da rampa da navegação.
