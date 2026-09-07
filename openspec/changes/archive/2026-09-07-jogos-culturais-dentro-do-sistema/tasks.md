## 0. Decisao

- [x] 0.1 Pergunta 6 respondida em `design.md`: **entrega B — retirar da grade ate integrar**. Sem resposta do dono, e a unica das duas que nao aposta: o dano atual e uma afirmacao falsa na tela ("100% Funcional" sobre nove jogos que nao registram nada, com zero rodadas no banco real) e sai barato; a entrega A e semanas de trabalho apostadas na resposta que a pergunta ainda nao teve. B e reversivel — os nove componentes ficam no repositorio e a spec desta change e o contrato de volta.

## 1. Entrega B

- [x] 1.1 Os nove sairam da grade, do sorteio da Partida Rapida (que sorteava entre 18 e caia em jogo que nao grava) e da aba "Jogos do Mundo"; a categoria `culturais` sumiu do estado e das abas.
- [x] 1.2 Componentes movidos para `src/components/minigames/culturais/` (`git mv`, imports ajustados), sem importador de rota. `README.md` na pasta com a divida por jogo e o contrato de volta.
- [x] 1.3 `MinigamesShowcase.tsx` removido (segundo roteador dos nove, sem importador desde sempre); `JogoAtivo`, `JogoCulturalMeta`, `JOGOS_CULTURAIS`, `jogoCulturalAtivo`, `abrirJogoCultural`, `jogosCulturaisFiltrados` e o bloco de render sairam de `Play.tsx`.
- [x] 1.4 E2E `tests/e2e/grade-so-com-jogos-do-sistema.e2e.ts`: `/jogar` nao lista nenhum dos nove, nao existe a string "100% Funcional" nem a aba "Jogos do Mundo", e as tres categorias que sobraram estao la.

## 2. Entrega A — infraestrutura comum

Nao executada por decisao (ver 0.1). As tarefas seguem escritas para quando a entrega A for autorizada; o contrato esta na spec `jogo-so-entra-pelo-sistema` e resumido em `src/components/minigames/culturais/README.md`.

- [ ] 2.1 `MinigameDef` ganha `idiomas` e `requisitos.material`; `MinigameId` inclui os 9 ids
- [ ] 2.2 `itemSource.ts` respeita escrita (latino/hangul/kana...) e idioma por def
- [ ] 2.3 `CascaDoJogo` (cabecalho, placar, fim de rodada) extraida dos clones jscpd
- [ ] 2.4 `montarRodada` ganha os ramos dos 9 (ou cauda generica quando baseado em cartao)
- [ ] 2.5 `functions/api/rank/[[path]].ts` aceita os ids novos — hoje ja aceita so os 9 classicos, entao nada a desfazer

## 3. Entrega A — por jogo (repetir 9x)

- [ ] 3.x `items` obrigatorio; conteudo fixo so como fallback declarado e visivel; voz por `item.lang`; `onFinish(report)` → `aoTerminar`; teste de componente

## 4. Grade

- [x] 4.1 A grade nao anuncia mais estado que o sistema nao garante: o selo "100% Funcional" nao existe no codigo, e todo card restante passa por `estadoDeCadaJogo`.
- [x] 4.2 `matriz-dos-jogos` continua cobrindo os 9 jogos do sistema (nao passa a cobrir 18: isso e da entrega A); `f3-rodada` segue provando a gravacao pelo funil unico.
- [x] 4.3 `npm test` verde (2.816) e e2e 18/18. Gates: typecheck, typecheck:core, lint, build, ast-grep, i18n:orfas, pseudo --check, cobertura --check, piso e audit:gate.

## 5. Nota sobre o piso de i18n

- [x] 5.1 A catraca criada em `idioma-alvo-e-ui-respeitados` pegou esta mudanca: 427 → 420 chamadas de `t()`, porque os rotulos dos nove cards sairam. Piso baixado para 420 no mesmo commit, com o motivo no `ci.yml` — que e exatamente o procedimento que a mensagem de erro do gate manda seguir. Nenhuma das chaves removidas estava traduzida em `en.json`, entao a cobertura real nao mudou.
