# Tarefas — onda 3

## 1. Catálogo: um só, e só o que tem leitor

- [x] 1.1 Destino declarado para os 128 itens do mestre (tabela no `design.md`)
- [x] 1.2 10 packs de emoji, com a linha correspondente em `PACKS_DE_EMOJI`
- [x] 1.3 8 cursores, como ids curados em `CURSORES` e não como `emoji:<char>`
- [x] 1.4 6 rastros — zero código novo: `estiloDeRastro` já resolve os alvos
- [x] 1.5 Recusar os 4 motores de partícula: a skin desconhecida cai em `circulo`, que é a skin
      grátis. Quatro itens de 110 a 400 Seeds entregariam o padrão de fábrica
- [x] 1.6 Recusar os 11 sem leitor, as 9 duplicatas `-`/`_`, os 5 `pal-*` e as 36 suítes
- [x] 1.7 `cur-laser` 🔫 vira `cur-lanterna` 🔦: app com perfil infantil não ganha cursor de arma
- [x] 1.8 Três conquistas passam a entregar cosmético; a união `CosmeticoExclusivo` alargada

## 2. Drop como evento do servidor

- [x] 2.1 `roundIdDoDrop`, `itensSorteaveisNoDrop`, `sortearItemDoDrop`, `valorDoDrop` no core
- [x] 2.2 `valorDoCredito` recusa `drop:` explicitamente, dizendo que o item é sorteado
- [x] 2.3 Rota: rodada existe e é do usuário; baú já aberto devolve o item do razão sem sortear
- [x] 2.4 `economiaRepo.dropsSorteados` — a posse por drop sai de `seed_credits.reason`
- [x] 2.5 Espelho no servidor efêmero, com as mesmas funções e os mesmos códigos de erro
- [x] 2.6 `SEEDS_DO_DROP = 5` = `PESOS_SEEDS.rodadaPerfeita`: o baú nunca paga mais que jogar bem
- [x] 2.7 Sorteio em duas etapas (75/25), para a taxa de raro não drenar com o catálogo

## 3. A moeda da temporada para de ser efeito colateral

- [x] 3.1 Medir o estrago: 24 itens novos levaram o total de 1.554 para 235 Seeds
- [x] 3.2 `COFRES_POR_DECADA` declarado, com os números que a divisão antiga produzia
- [x] 3.3 Cofre reservado, itens preenchem o resto, excedente divide a coluna do marco
- [x] 3.4 Total conferido: 1.554 Seeds, 15 cofres, 123 itens no passe — igual ao de antes

## 4. Contratos novos

- [x] 4.1 `tests/dropComAutoridade.test.ts` — 18 casos do sorteio e da autorização
- [x] 4.2 `tests/integration/drop-idempotente.test.ts` — mesmo `roundId`, mesmo item, uma vez só
- [x] 4.3 `tests/contratos/economia.test.ts` — paridade Express/efêmero para o drop
- [x] 4.4 `tests/contratos/rota-de-obtencao.test.ts` — a recompensa é proporcional ao feito

## 5. Portões

- [x] 5.1 `typecheck`, `typecheck:core`
- [x] 5.2 `rtk proxy npm run lint` — 0 avisos
- [x] 5.3 `npx vitest run` — 3.205 testes
- [x] 5.4 `morto:arquivos`, `morto:ciclos`
- [x] 5.5 i18n (os quatro), `audit:gate`, `ast-grep` (0 erros), `build`, `workflows:validar`
- [x] 5.6 e2e por JSON — 25/25
- [x] 5.7 Passada manual no navegador: as tres recusas com o motivo certo (rodada inexistente,
      formato antigo do ramo, id ambiguo), e o caminho feliz contra uma rodada real do banco --
      `part-confete` sorteado, `reason: drop:part-confete`, `amount: 5`, e o reenvio devolvendo o
      MESMO item com `jaExistia: true`. A linha foi apagada (soft delete) depois do teste, com
      backup: ela foi creditada por requisicao, nao por jogo
