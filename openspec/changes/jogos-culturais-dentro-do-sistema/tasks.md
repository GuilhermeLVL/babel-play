## 0. Decisao

- [ ] 0.1 Pergunta 6 respondida em `design.md` (A integrar / B retirar); lista dos 9 com a entrega por jogo

## 1. Entrega B (se escolhida, ou como passo intermediario)

- [ ] 1.1 Remover os 9 da grade, da partida rapida e dos filtros "Jogos do Mundo"
- [ ] 1.2 Mover componentes para `src/components/minigames/culturais/` sem importador de rota
- [ ] 1.3 Remover `MinigamesShowcase.tsx`, `JogoAtivo`, `JOGOS_CULTURAIS`
- [ ] 1.4 E2E: `/jogar` nao lista os 9

## 2. Entrega A — infraestrutura comum

- [ ] 2.1 `MinigameDef` ganha `idiomas` e `requisitos.material`; `MinigameId` inclui os 9 ids
- [ ] 2.2 `itemSource.ts` respeita escrita (latino/hangul/kana...) e idioma por def
- [ ] 2.3 `CascaDoJogo` (cabecalho, placar, fim de rodada) extraida dos clones jscpd
- [ ] 2.4 `montarRodada` ganha os ramos dos 9 (ou cauda generica quando baseado em cartao)
- [ ] 2.5 `functions/api/rank/[[path]].ts` aceita os ids novos

## 3. Entrega A — por jogo (repetir 9x)

- [ ] 3.x `items` obrigatorio; conteudo fixo so como fallback declarado e visivel; voz por `item.lang`; `onFinish(report)` → `aoTerminar`; teste de componente

## 4. Grade

- [ ] 4.1 Cards gerados de `MINIGAMES`; sem "100% Funcional"; gating por `estadoDeCadaJogo`
- [ ] 4.2 `matriz-dos-jogos` cobre 18; `f3-rodada` prova gravacao de um cultural
- [ ] 4.3 `npm test` e e2e verdes
