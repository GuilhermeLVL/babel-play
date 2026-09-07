> **Metade desta change nao esta em `main`.** Ela foi escrita sobre a arvore suja de 07/09, que
> tinha `src/core/catalogoMestre.ts` (128 itens do Cofre), `src/lib/{suitesTematicas,drops}.ts` e
> `views/gamificacao/**`. A change `linha-de-base-verde` guardou essa camada na branch
> `gamificacao-v2-wip` (decisao (b) do dono). Entao: tudo que fala do Cofre, do Catalogo Mestre,
> das suites tematicas, dos drops e do `GamificacaoHub` NAO tem alvo em `main` — nao foi feito, e
> nem deveria ser, porque a change que decide o destino daquela camada e outra.
>
> O que foi feito e a parte que existe em `main` e que a auditoria mediu como quebrada: as duas
> reguas do cliente que discordavam, a rota que gravava sem conferir posse, a posse de conquista
> que so existia no navegador, e a URL `/loja/undefined`.

## 1. Um catalogo, ids unicos

- [ ] 1.1 Fundir `CATALOGO_DA_LOJA` e `CATALOGO_MESTRE` em `src/core/catalogo/` com namespace por origem. **Sem alvo em `main`:** `catalogoMestre.ts` esta na branch `gamificacao-v2-wip`. A colisao de 31 ids (achado A04) e uma propriedade da camada guardada, nao do codigo em `main`.
- [ ] 1.2 Itens sem canal de obtencao saem ou ganham canal (pergunta 8). **Sem alvo em `main`** pelo mesmo motivo: os 47/128 itens sem canal sao do Catalogo Mestre.

## 2. Uma regua

- [x] 2.1 `estadoPorAlvo(tipo, alvo, nivel, saldo, escolhaAtual)` em `src/lib/loja.ts`: a MESMA regua de `estadoDoItem`, endereçada por `(tipo, alvo)` para quem nao tem o item em maos.
- [x] 2.2 `desbloqueios.desbloqueado` delega a ela. Era uma segunda regua, com tabela de niveis propria, que so conhecia nivel: quem comprasse o tema Linear por 60 seeds no nivel 1 via o item como "seu" na Loja e o cadeado no seletor de aparencia — pagou e nao pode usar. `EXCLUSIVOS_DE_CONQUISTA` (mapa local) saiu: o catalogo ja tem `exclusivoDe`.
- [x] 2.3 A tabela de niveis de `desbloqueios.ts` foi apagada; `nivelNecessario` e `recompensasDoNivel` leem o catalogo. Os numeros eram os mesmos escritos duas vezes, concordando por coincidencia. De quebra, o aviso de "subiu de nivel" passa a falar de cursores e particulas, que a tabela local nao conhecia.
- [x] 2.4 Invariante em `tests/integration/settings-posse.test.ts`: para todo item de aparencia do catalogo, em quatro niveis, as duas reguas dao a MESMA resposta; e `nivelNecessario` bate com o `nivel` do catalogo item a item.
- [ ] 2.5 Remover `estaDesbloqueadoNoCofre` (G3). **Sem alvo em `main`** — vive em `catalogoMestre.ts`.

## 3. Chokepoint nos setters

- [x] 3.1 O chokepoint JA EXISTE em `main`: `src/lib/galeria/equipar.ts` (`equiparItem`) confere `estadoDoItem` antes de chamar qualquer setter, e Loja, Inventario e Passe passam por ele. Verificado: `Personalizar.tsx` aplica perfil so depois de `faltaParaOPerfil` (que usa `galeria/acesso.ts` → `estadoDoItem`); `restaurar.ts` reaplica o que ja esta salvo, que e a regra 2 (escolha em uso nunca e rebaixada).
- [x] 3.2 `PUT /api/settings` confere a posse no SERVIDOR (`server/lib/posseDeCosmeticos.ts`). Era o furo real: a rota validava so a forma, entao `{"ui":{"theme":"premium"}}` equipava o tema mais caro sem nivel, sem seeds e sem compra. Regua no cliente e sugestao — a rota esta aberta a quem souber o caminho, e este app VENDE esses itens. Recusa 403 com `code: 'item_nao_possuido'` e o que falta em `detalhes`.
- [ ] 3.3 Tornar os setters privados / regra ast-grep. **Nao feito:** os dois chamadores diretos que restam (`Personalizar.tsx`, `EditorDoItem.tsx`) ja passam por uma regua antes, entao a regra seria vermelha sem haver furo — e uma regra que se aprende a ignorar e pior que nenhuma. Fica para quando o editor de itens for reescrito (`personalizar-v4`).

## 4. Posse vem do servidor

- [x] 4.1 `economiaRepo.conquistasCreditadas(userId)` deriva a posse de conquista de `seed_credits.reason = 'conquista:%'`. Ela morava so em `localStorage['babel.conquistas']` — editavel, nunca reconciliada (achado A12) — e o credito ja era gravado com esse `reason` desde a economia v2: o dado existia e faltava alguem perguntar.
- [x] 4.2 A conferencia de posse do servidor usa as quatro fontes que o navegador nao falseia: nivel (`economiaDoUsuario`), compra (`seed_spends`), conquista (`seed_credits`) e premium (`credit_spends`).
- [ ] 4.3 `computeProfile` devolver `conquistas`/`premium` para o cliente HIDRATAR o cache. **Nao feito:** muda o contrato de `/api/metrics/profile`, que `arranque-leve-e-payloads-enxutos` (onda 4) vai revisar inteiro; fazer agora seria mexer duas vezes no mesmo payload. O furo que importava — a rota gravar sem conferir — esta fechado.

## 5. Rotas da loja em um vocabulario

- [x] 5.1 A tabela de apelidos de aba saiu de `Loja.tsx` e foi para `lib/rotas.ts` (`normalizarAbaDaLoja`), que e onde a URL e escrita. `Play.tsx` navegava com `aba: 'progressao'`, a Loja abria certo e a barra de endereco mostrava `/loja/undefined` — que nao recarrega e nao se compartilha (achado A16). Aba desconhecida agora cai em `/loja`.
- [x] 5.2 Teste em `tests/rotas.test.ts`: apelido vira canonica, desconhecida cai em `/loja`, e as quatro abas fecham o ciclo URL → estado → URL.
- [ ] 5.3 `abaExigeConta` aplicada ou removida. **Nao feito:** e decisao sobre o gate de conta, que pertence a `porta-de-entrada` (tarefa 3.3 dela, ainda aberta) e a `codigo-morto-removido`. Registrar em dois lugares faria a decisao ser tomada duas vezes.
- [ ] 5.4 `ResumoDaRodada` com o nivel real e `registrarFimDePartida` em toda rodada. **Sem alvo em `main`:** `drops.ts` esta na branch guardada, e `registrarFimDePartida` nao existe aqui.

## 6. Verificacao

- [x] 6.1 `npm test` verde (2.850, 10 novos); typecheck, typecheck:core, lint, build, ast-grep, i18n (orfas, pseudo, cobertura, piso), audit:gate; e2e 18/18.
