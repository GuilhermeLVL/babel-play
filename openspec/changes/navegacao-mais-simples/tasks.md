Legenda: **[D]** depende do dono; **[R]** pede aparelho real. Fatias verticais; a mais arriscada (ver se a opção A funciona com
pessoas) vem antes de qualquer código. Nenhuma tarefa de código começa sem a 2.4 aprovada.

## 0. Ganhos sem risco, já atrás da flag (podem sair antes do protótipo)

- [ ] 0.1 Flag `navegacao_simples` (constante em `src/core/planos.ts`, migração de semente PG e SQLite, desligada, sem regra de plano).
      Verificar: teste de flags lê `habilitada = 0`; com a flag desligada nenhum teste existente de navegação muda.
- [ ] 0.2 Com a flag: o trilho não esconde o rótulo por altura (rola), e `EscolhaAoVivo` lembra o último modo e abre direto
      quando só uma opção é possível.
      Verificar: teste de componente com altura de 600 px mostra 100% dos rótulos; Playwright em 1280x600 confere o texto visível.

## 1. Medir a linha de base (a premissa)

- [ ] 1.1 Script Playwright `tests/e2e/navegacao-toques.spec.ts` que, de uma sessão de Início, conta toques e botões de primeiro
      nível para T1 a T7 em desktop (1280x800), tablet (820x1180) e celular (390x844), nos perfis pro, kids e senior, e grava
      `docs/auditoria/2026-11-navegacao-linha-de-base.json`.
      Verificar: `npx playwright test navegacao-toques` passa e o JSON confirma ou corrige as estimativas de `inventario.md`.
- [ ] 1.2 Matriz de alcançabilidade: cada `ViewType` abre pelo endereço atual e é alcançável em <= 3 toques a partir do Início.
      Verificar: teste lista os 23 valores e falha se algum não abre; entra na CI (matriz rota-guarda).
- [ ] 1.3 **[D]** Decidir de uma vez as 5 perguntas da seção "Decisões do dono" antes da fatia 2.
      Verificar: respostas datadas em `docs/pendencias-do-dono.md`.

## 2. Protótipo antes de código

- [ ] 2.1 `docs/prototipos/navegacao-simples.html` (e `-src/`), com as opções A, B e a atual lado a lado, em 3 larguras, com
      contador de toques e de itens de primeiro nível.
      Verificar: abrir o arquivo e fazer as 7 tarefas nas três opções; o contador bate com `opcoes.md`.
- [ ] 2.2 Roteiro de teste com 5 pessoas (1 criança com responsável, 1 sênior, 3 adultos), 7 tarefas, 20 minutos; sem gravar
      voz nem tela, só anotação do moderador, sem dado pessoal. **[D]** escolher as pessoas e o consentimento (menor).
      Verificar: tabela de sucesso por tarefa e por opção em `docs/auditoria/`.
- [ ] 2.3 Atualizar `opcoes.md` com os toques medidos e a recomendação final (A ou B).
      Verificar: critérios de aceite da proposta reescritos com a opção escolhida.
- [ ] 2.4 **[D]** Aprovar o protótipo e a opção.
      Verificar: decisão datada; só depois disso as fatias 3 a 6 começam.

## 3. A casca e a página "Você"

- [ ] 3.1 `ORCAMENTO_DE_NAVEGACAO` em `navItems.ts` e o teste que falha ao estourá-lo.
      Verificar: `npx vitest run tests/navOrcamento.test.ts`; adicionar um sexto destino de primeiro nível quebra o teste.
- [ ] 3.2 Nova `ViewType` `voce` e a página `/voce` com as seções (Progresso, Personalizar, Planos, Ajustes, Perfil, Ajuda,
      Sobre, Avisos, Aparência rápida). Rotas antigas continuam.
      Verificar: teste de componente; teste de rotas (todos os endereços antigos abrem a tela de antes); matriz de 1.2 verde.
- [ ] 3.3 Trilho e barra leem a mesma lista de 5 destinos (Início, Ao vivo, Praticar, Biblioteca, Você), com a flag.
      Verificar: teste de componente nos três formatos e nos três perfis (rótulos de `labels` por perfil); Playwright confere 5
      itens e todos com rótulo visível.
- [ ] 3.4 Planos continua achável: faixa no Início e seção em "Você", e a medição de cliques de `metricasOfertas` antes e depois.
      Verificar: teste de componente; consulta de métrica comparada na rampa (5.2).

## 4. Ao vivo sem submenu

- [ ] 4.1 Seletor "Legendar | Conversar" dentro da tela de captura e "Legenda flutuante" como botão dela; saída de
      `EscolhaAoVivo` da navegação.
      Verificar: teste de componente; T1 e T2 em <= 2 toques no Playwright; `/interprete` e `/capturar` ainda abrem o modo certo.
- [ ] 4.2 **[R]** Conferir no Quest e no celular real que o seletor não atrapalha a captura em andamento.
      Verificar: roteiro curto em `docs/testar-no-quest.md` executado; capturas anexadas.

## 5. Praticar, Biblioteca e Ajustes

- [ ] 5.1 `AbasDePraticar` também no computador e aba "Livros" (e "Leituras" com a flag) em Biblioteca.
      Verificar: testes de componente; T3, T4 e T7 dentro das metas no Playwright.
- [ ] 5.2 Ajustes: "Mais usados", grupos recolhidos, busca e a redução para <= 5 abas.
      Verificar: teste de componente; Playwright prova T6 em <= 3 toques; nenhuma aba com mais de 8 itens visíveis antes de
      "Mostrar mais"; rotas `/ajustes/<aba>` antigas continuam abrindo a seção certa.
- [ ] 5.3 i18n dos rótulos novos nos catálogos `en`, `es`, `ar`.
      Verificar: `npm run i18n` e o portão `ordenar.mjs --check` passam.

## 6. Rampa e remoção

- [ ] 6.1 **[D][R]** Ligar `navegacao_simples` só para o id do dono, usar uma semana em celular, depois rampa 10/50/100% olhando
      cliques em Planos, abandono do Início e a conclusão de T1 a T4.
      Verificar: decisão datada por degrau; critérios de aceite da proposta lidos antes de cada degrau.
- [ ] 6.2 Remover a casca antiga e o `EscolhaAoVivo` depois de um ciclo estável com a flag em 100%.
      Verificar: `npx knip` sem arquivo sem uso; testes e Playwright verdes.
