-- GAP-017 / S26-13 — `billing_events.payload` SÓ COM O QUE O CÓDIGO USA (auditoria de cobrança de 02/10/2026).
--
-- O webhook do Asaas gravava o corpo do evento como chegava, para um administrador poder reaplicar o
-- que ficou `nao-aplicado` (A05). O corpo traz dado pessoal do pagador — nome e CPF quando o Asaas os
-- inclui, o id do cliente, a descrição da cobrança, os últimos dígitos e o token do cartão, os links
-- da fatura e do recibo — e ele ficava ali sem prazo de guarda. Reaplicar só precisa de ids, evento,
-- valor, status e datas.
--
-- A ENTRADA já grava reduzido (`reduzirPayload`, em `server/db/repositories/billingEvents.ts`). Esta
-- migration faz o mesmo com as LINHAS ANTIGAS, com a MESMA lista de campos permitidos — mudou lá, mude
-- aqui (o teste `tests/integration/billing-events-payload-minimo.test.ts` compara os dois resultados):
--   evento:      id, event, dateCreated
--   payment:     id, subscription, installment, installmentNumber, externalReference, value, netValue,
--                status, billingType, deleted, dueDate, originalDueDate, paymentDate, clientPaymentDate,
--                confirmedDate, dateCreated
--   subscription: id, externalReference, value, status, cycle, billingType, deleted, nextDueDate, dateCreated
-- Só PRIMITIVOS (texto de até 200 caracteres, número, booleano): objeto ou lista numa chave permitida
-- não atravessa, e `null` some (o `eventoSchema` lê ausência, não `null`).
--
-- COMO O SQL MONTA O JSON: `json_each` lista as chaves de cada objeto; o filtro deixa as permitidas;
-- `json_group_object` remonta. O valor passa por `json(...)` para manter o TIPO — `json_quote` devolve
-- o texto JSON de texto e número, e para booleano o texto é o próprio nome do tipo (`true`/`false`),
-- porque `json_each.value` os entrega como 1/0. O `json_patch` final descarta `payment`/`subscription`
-- quando o evento não os tem (chave com `null` no patch = chave removida, RFC 7396).
--
-- 1ª instrução: o que NÃO é um objeto JSON (texto solto, lista) não dá para reduzir com segurança —
-- sai inteiro. O reprocessamento do admin já respondia 409 "payload fora da forma" para essas linhas.
-- 2ª instrução: reduz todo o resto.
--
-- IDEMPOTENTE: reduzir um payload já reduzido devolve o mesmo payload. Só dado, nenhuma mudança de
-- esquema (expand): o código anterior lê o payload reduzido sem diferença — os campos que
-- `aplicarEvento` usa são exatamente os que ficam.
-- REVERSAO: não há — os campos pessoais são apagados de propósito, e é esse o efeito pedido. O que o
-- reprocessamento precisa continua na linha; para o resto, a fonte é o próprio Asaas (`GET /payments/{id}`).
UPDATE billing_events
SET payload = NULL
WHERE payload IS NOT NULL
  AND (NOT json_valid(payload) OR json_type(payload) <> 'object');
--> statement-breakpoint
UPDATE billing_events
SET payload = json_patch(
  (
    SELECT json_group_object(e.key, json(CASE WHEN e.type IN ('true', 'false') THEN e.type ELSE json_quote(e.value) END))
    FROM json_each(billing_events.payload) AS e
    WHERE e.key IN ('id', 'event', 'dateCreated')
      AND (e.type IN ('integer', 'real', 'true', 'false') OR (e.type = 'text' AND length(e.value) <= 200))
  ),
  json_object(
    'payment', json(CASE WHEN json_type(billing_events.payload, '$.payment') = 'object' THEN (
      SELECT json_group_object(e.key, json(CASE WHEN e.type IN ('true', 'false') THEN e.type ELSE json_quote(e.value) END))
      FROM json_each(billing_events.payload, '$.payment') AS e
      WHERE e.key IN (
          'id', 'subscription', 'installment', 'installmentNumber', 'externalReference',
          'value', 'netValue', 'status', 'billingType', 'deleted',
          'dueDate', 'originalDueDate', 'paymentDate', 'clientPaymentDate', 'confirmedDate', 'dateCreated'
        )
        AND (e.type IN ('integer', 'real', 'true', 'false') OR (e.type = 'text' AND length(e.value) <= 200))
    ) END),
    'subscription', json(CASE WHEN json_type(billing_events.payload, '$.subscription') = 'object' THEN (
      SELECT json_group_object(e.key, json(CASE WHEN e.type IN ('true', 'false') THEN e.type ELSE json_quote(e.value) END))
      FROM json_each(billing_events.payload, '$.subscription') AS e
      WHERE e.key IN (
          'id', 'externalReference', 'value', 'status', 'cycle', 'billingType', 'deleted', 'nextDueDate', 'dateCreated'
        )
        AND (e.type IN ('integer', 'real', 'true', 'false') OR (e.type = 'text' AND length(e.value) <= 200))
    ) END)
  )
)
WHERE payload IS NOT NULL;
