## 1. Autoridade para todo credito

- [ ] 1.1 `valorDoCredito(creditoId, ctx)` em `economiaAutoridade.ts` cobrindo `conquista-*`, `passe:*:cofre-*` (via `seedsDoCofreDoPasse` + nivel), `drop:*`
- [ ] 1.2 `POST /api/metrics/seeds/creditar` usa so `valorDoCredito`; `amount`/`xp` removidos do schema
- [ ] 1.3 Efemero (`servidor.ts:465-476`) usa `valorDoCredito`; ignora `amount`/`xp`

## 2. Drops como evento do servidor

- [ ] 2.1 Registro de drop pendente por rodada no servidor (idempotente por `roundId`)
- [ ] 2.2 Abrir drop: sorteio no servidor com o catalogo unico; credito de 40 Seeds quando nao ha item elegivel, uma vez por drop
- [ ] 2.3 `drops.ts` vira cliente dessas rotas; `localStorage` so cache; efemero espelha

## 3. Combo e recordes

- [ ] 3.1 Migration aditiva `exercise_results.combo`; `rodadaSchema.melhorSequencia`; `addRodada` grava
- [ ] 3.2 `listarRecordes` devolve `melhorCombo`, `precisao`, `ultimaEm`; tipo unico em `contract.ts`
- [ ] 3.3 `duelista` dispara com o combo do servidor

## 4. Campos do perfil

- [ ] 4.1 `computeProfile` emite `capturaMinutos` e `idiomas` iguais ao efemero
- [ ] 4.2 `ouvinte` e `poliglota` cobertos por teste de integracao

## 5. Gasto atomico

- [ ] 5.1 `POST /seeds/gastar` e `POST /billing/gastar` em `emTransacao` com releitura do saldo
- [ ] 5.2 Teste de concorrencia (dois gastos simultaneos, saldo para um)

## 6. Passe e historico

- [ ] 6.1 `PasseDeTemporada` credita via a rota (agora aceita) e marca o bau so apos 200; sem repeticao em mount
- [ ] 6.2 Decisao da pergunta 9 em `design.md`; script idempotente de reconciliacao dos `passe:t1:*` historicos
- [ ] 6.3 `npm test` verde; paridade efemero x Express
