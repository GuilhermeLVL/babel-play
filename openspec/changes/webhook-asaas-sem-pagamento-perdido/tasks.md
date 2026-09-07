## 1. Estado do evento

- [ ] 1.1 Migration aditiva: `billing_events.estado` (default `aplicado`), `motivo`, `payload` (JSON)
- [ ] 1.2 `billingEventsRepo.marcarSeNovo` grava `payload`; novo `marcarNaoAplicado(id, motivo)` e `listarPendentes()`

## 2. Handler do webhook

- [ ] 2.1 `billing.ts:371` (avulso desconhecido): `nao-aplicado` + `log('error')` com id; resposta 200
- [ ] 2.2 `billing.ts:385-390` (assinatura divergente): conceder `planoPeloValor` quando existir; senao `nao-aplicado`
- [ ] 2.3 Nenhum `break` sem estado registrado

## 3. Reprocessamento

- [ ] 3.1 `GET /api/admin/billing/pendentes` (RBAC admin)
- [ ] 3.2 `POST /api/admin/billing/reprocessar/:id` reaplica o payload salvo com a logica atual, idempotente
- [ ] 3.3 Testes de RBAC para as duas rotas

## 4. Testes

- [ ] 4.1 Cenarios 1-4 do "Pronto quando" em `tests/integration/billing-webhook.test.ts`
- [ ] 4.2 `npm test` verde
