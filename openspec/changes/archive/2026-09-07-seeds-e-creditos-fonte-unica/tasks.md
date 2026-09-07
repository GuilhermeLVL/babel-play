> **Entregue.** A pergunta 9 (o passivo histórico) foi respondida pelo dono em 07/09 — "pode mexer
> à vontade, a aplicação ainda não tem usuários" — e a decisão, o script e os números estão em
> `design.md`. A seção 2 (drops) é a única que não entrega código, e não por escolha: o código de
> drop não existe em `main`. Está dito item a item.

## 1. Autoridade para todo credito

- [x] 1.1 `valorDoCredito(creditoId)` em `economiaAutoridade.ts`, cobrindo `conquista-*` e `passe:*:cofre-*`. A curva do passe não é passada por parâmetro (como fazia `seedsDoCofreDoPasse`, que nunca teve chamador): ela é LIDA de `slotsDoPasse()`, a mesma função que desenha o trilho — o cofre vale o que a tela mostra porque é o mesmo número. `drop:*` fora: ver 2.
- [x] 1.2 `POST /api/metrics/seeds/creditar` usa só `valorDoCredito`. `amount`/`xp` já haviam saído do schema em 01/09; o que faltava era a rota reconhecer as famílias além de conquista — e conferir o NÍVEL da década antes de creditar um cofre.
- [x] 1.3 Efêmero usa `valorDoCredito`, ignora `amount`/`xp` e confere o nível com `economiaDeMetricas`. **Além do previsto:** o GASTO do efêmero também passou a usar `autorizarGasto` + conferência de saldo. Ele gravava qualquer `reason` com qualquer `amount`, e a posse é derivada do razão — era o mesmo furo que o Express fechou em 01/09, do lado que MIGRA para a conta.

## 2. Drops como evento do servidor

- [ ] 2.1 Registro de drop pendente por rodada. **Não feito: não há drop em `main`.** `src/lib/drops.ts`, `ModalDropDePartida` e `registrarFimDePartida` foram para a branch `gamificacao-v2-wip` quando a árvore foi limpa. Escrever a autoridade de um evento que nada emite seria código sem chamador, que envelhece até a camada voltar — provavelmente com outro formato de id.
- [ ] 2.2 Abrir drop com sorteio no servidor. Idem.
- [x] 2.3 O que dá para fazer hoje, e está feito: `valorDoCredito` RECUSA `drop-partida-bau-<timestamp>` com 400 e código `credito_desconhecido`, com teste. O id gerado com `Date.now()` não entra mais em lugar nenhum, e quando a camada voltar ela encontra o ponto exato onde declarar quanto um drop vale.

## 3. Combo e recordes

- [x] 3.1 Migração 0025 (aditiva, anulável) com `exercise_results.combo`; `rodadaSchema` aceita `melhorSequencia`; `addRodada` grava. O cliente já enviava o campo desde a economia v2 — o `.strip()` do Zod o descartava por ele não estar declarado, e não havia coluna para recebê-lo.
- [x] 3.2 `listarRecordes` devolve `melhorCombo`, `precisao` e `ultimaEm`. `RecordeDoJogo` virou tipo ÚNICO em `core/learning/contract.ts`: havia duas declarações, e a do cliente tinha três campos que a do servidor não — `melhorCombo ?? 0` lia um campo que nunca chegava.
- [x] 3.3 `duelista` dispara com o combo do servidor (`exerciseResultsRepo.melhorComboPorJogo`). Ela saiu de `CONQUISTAS_CONFERIVEIS` porque o dado não existia, não porque a condição fosse subjetiva.

## 4. Campos do perfil

- [x] 4.1 `computeProfile` emite `capturaMinutos` (total, sem teto) e `idiomas`, a mesma conta do efêmero. `ouvinte` pede 60 minutos GRAVADOS e o servidor só emitia o PREMIADO, com teto de 30/dia: quem gravasse 70 minutos num dia via a conquista presa em 30.
- [x] 4.2 `ouvinte` e `poliglota` cobertos por teste de integração, nos dois sentidos (recusada sem o número, creditada com ele).

## 5. Gasto atomico

- [x] 5.1 O teto entra no próprio INSERT (`INSERT ... SELECT ... WHERE`), em `seedSpendsRepo.debitar` e `creditsRepo.debitar`. **Não é `emTransacao`**, e o porquê está em `design.md`: seria segurar cinco varreduras de tabela numa transação de escrita para conferir o saldo de uma pessoa.
- [x] 5.2 Teste de concorrência sobre o MECANISMO: dez gastos de 40 simultâneos contra 100 Seeds ganhas — dois entram, oito recebem 402, e o invariante `gastas <= ganhas` é afirmado como invariante.

## 6. Passe e historico

- [x] 6.1 `PasseDeTemporada` credita pela rota (que agora aceita) mandando só o `creditoId`. O baú só é marcado depois do 200, como já era; a diferença é que agora existe um 200 — antes o 400 fazia o efeito repetir a cada montagem, para sempre.
- [x] 6.2 Pergunta 9 decidida em `design.md`; `scripts/economia/reconciliar-creditos.ts` escrito, rodado em cópia, aplicado no banco real com backup: 22 linhas soft-deletadas, 2.923 → 2.004 Seeds.
- [x] 6.3 Suíte verde; paridade efêmero × Express em `tests/contratos/economia.test.ts` — o mesmo pedido, os dois servidores, os mesmos valores, inclusive o saldo restante depois de gastar.
