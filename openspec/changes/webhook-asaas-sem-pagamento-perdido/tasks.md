## 1. Estado do evento

- [x] 1.1 Migration aditiva `0022_eventos_de_billing_com_estado`: `billing_events.estado` (default `aplicado`), `motivo`, `payload` (JSON). Um terceiro estado, `ignorado`, cobre evento sem usuario ou nao tratado — auditado, nunca pendente
- [x] 1.2 `billingEventsRepo.marcarSeNovo` grava `payload`; novos `registrarResultado(id, estado, motivo)`, `ler(id)` e `listarPendentes()`

## 2. Handler do webhook

- [x] 2.1 Avulso desconhecido: `nao-aplicado` com motivo + `log('error')` com o id; resposta 200 (`server/lib/billingEventos.ts`)
- [x] 2.2 Assinatura divergente: concede `planoPeloPreco` quando o evento traz valor e registra a divergencia no `motivo`; sem valor, `nao-aplicado`
- [x] 2.3 Nenhum `break` sem estado registrado: o efeito vive em `aplicarEvento`, que devolve estado e motivo para todo caminho; o webhook grava por `registrarResultado`

## 3. Reprocessamento

- [x] 3.1 `GET /api/admin/billing/pendentes` (admin e support)
- [x] 3.2 `POST /api/admin/billing/reprocessar/:id` (admin) reaplica o payload guardado com `aplicarEvento`; evento ja `aplicado` responde `repetido`; sem payload (linha anterior a esta change) responde 409
- [x] 3.3 Testes de RBAC para as duas rotas em `tests/integration/rbac-admin-endpoints.test.ts`

## 4. Testes

- [x] 4.1 Cenarios 1-4 do "Pronto quando" em `tests/integration/billing-webhook.test.ts` (divergente com valor concede o plano pago; sem valor fica pendente; avulso desconhecido pendente e reaplicado uma vez; reentrega repetida sem efeito duplo)
- [x] 4.2 `npm test` verde (saida no PR)
