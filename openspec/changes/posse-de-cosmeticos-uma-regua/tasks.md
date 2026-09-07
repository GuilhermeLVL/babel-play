## 1. Catalogo unico

- [ ] 1.1 `src/core/catalogo/`: tipo `ItemDoCatalogo` com `origem` (`loja`|`cofre`), `canal` fechado, `preco`, `nivel`, `conquistaId?`; ids com namespace
- [ ] 1.2 Migrar `CATALOGO_DA_LOJA` e `CATALOGO_MESTRE`; mapa de ids antigos → novos para `babel.loja_possuidos` e `seed_spends.reason`
- [ ] 1.3 Decisao da pergunta 8 em `design.md`; itens sem canal implementado removidos ou com canal
- [ ] 1.4 Teste de invariante: ids unicos, canal implementado, `conquistaId` existe em `CONQUISTAS`

## 2. Uma regua

- [ ] 2.1 `estadoDoItem(item, ctx)` com `ctx` explicito (nivel, saldo, conquistas, premium, possuidos, liberadoTudo)
- [ ] 2.2 Remover `desbloqueado`/`nivelNecessario`/`EXCLUSIVOS_DE_CONQUISTA` (desbloqueios.ts) e `estaDesbloqueadoNoCofre` (catalogoMestre)
- [ ] 2.3 `GaleriaDoCofre`, `MontadorDeEstiloDeck`, `Loja`, `App.tsx:479` usam a regua unica

## 3. Chokepoint de equipar

- [ ] 3.1 `equiparItem(id)` valida com `estadoDoItem` e so entao grava (tema, paleta, cursor, rastro, particula, pack, suite, shader)
- [ ] 3.2 Setters de `theme.ts`, `particulas.ts`, `cursores.ts`, `rastroDoMouse.ts`, `suitesTematicas.ts` deixam de ser exportados (ou exigem prova de posse)
- [ ] 3.3 `aplicarSuiteTematica` devolve erro tratado; `GaleriaDoCofre.tsx:161-167` nao toasta sucesso sem sucesso
- [ ] 3.4 `PUT /api/settings`: validar `ui.theme`/`ui.customColors`/paleta contra posse derivada do ledger; 403 com `falta`

## 4. Posse do servidor

- [ ] 4.1 `computeProfile` devolve `conquistas: string[]` e `premium: string[]`
- [ ] 4.2 `conquistasPosse.ts` e `carteira.ts` hidratam do perfil sempre (inclusive `!authRequired`, via efemero)
- [ ] 4.3 `drops.ts`: posse gravada com id namespaced; drop de item ja possuido nao existe (sorteio exclui)

## 5. Rotas e conta

- [ ] 5.1 Fundir `ABA_DA_LOJA` + `ALIAS_DE_ABA` em `rotas.ts`; `Play.tsx:2528` e `Loja.tsx:503` emitem abas validas; `/creditos` → compra
- [ ] 5.2 `GamificacaoHub` consome `comprar`/`comprarComCreditos` ou os props saem
- [ ] 5.3 `abaExigeConta`: aplicar em loja/passe/conquistas ou remover com a regra documentada
- [ ] 5.4 `ResumoDaRodada` recebe `progress.level`; `registrarFimDePartida` em `aoTerminar`

## 6. Testes

- [ ] 6.1 Reescrever `acessoGaleria`, `galeria`, `loja`, `desbloqueio(s)`, `cofreGameplay`, `equipar`, `progressao`, `cromas` para a regua unica
- [ ] 6.2 Novos: `tests/catalogo-unico.test.ts`, `tests/integration/settings-posse.test.ts`, casos em `tests/rotas.test.ts`
- [ ] 6.3 `npm test` verde
