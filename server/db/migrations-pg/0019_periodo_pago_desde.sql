-- COTA PELO PERÍODO PAGO (change `cota-pelo-periodo-pago`): duas colunas nulas e dois índices, EXPAND.
--   `subscriptions.periodo_pago_desde`: o vencimento (ms) da cobrança que concedeu o período em vigor (no 12x, o da 1ª
--   parcela). Gravado SÓ pela aplicação de um pagamento (`server/lib/billingEventos.ts`), no mesmo upsert do
--   `current_period_end`. É a âncora da janela da cota de quem paga: o cancelamento fora dos 7 dias, o estorno e o admin
--   mexem no `current_period_end`, e a âncora não pode andar com eles (senão cancelar zeraria a cota).
--   `subscriptions.ciclo_da_cobranca`: o ciclo (`mensal` | `anual`) da cobrança REGISTRADA, gravado por `/assinar` junto
--   com o id e o `plano_da_cobranca` (`ciclo` é o do período concedido, e `/assinar` numa linha existente não o toca).
--   `billing_events (user_id, event)` e `(provider_ref)`: a busca da cobrança duplicada no estorno e a da reconciliação.
-- BACKFILL, uma vez: as linhas do Asaas em dia ou em atraso com período recebem o início derivado do fim gravado (35 dias
--   no mensal, 370 no anual). As canceladas ficam nulas (o fim delas pode ter sido mexido pelo cancelamento) e seguem na
--   janela do mês do calendário até o próximo pagamento. A conta é em `bigint` (dias × ms passa de 2^31: em `int4` o
--   Postgres recusa com "integer out of range"; `tests/integration/migracao-periodo-pago-desde.test.ts`). Par SQLite: 0061.
-- REVERSÃO: `DROP INDEX "idx_billing_events_user_event"`, `DROP INDEX "idx_billing_events_provider_ref"` e
--   `ALTER TABLE "subscriptions" DROP COLUMN "periodo_pago_desde"`, `DROP COLUMN "ciclo_da_cobranca"` — só depois de
--   voltar o código que as lê.
ALTER TABLE "subscriptions" ADD COLUMN "periodo_pago_desde" bigint;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "ciclo_da_cobranca" text;--> statement-breakpoint
CREATE INDEX "idx_billing_events_user_event" ON "billing_events" USING btree ("user_id","event");--> statement-breakpoint
CREATE INDEX "idx_billing_events_provider_ref" ON "billing_events" USING btree ("provider_ref");--> statement-breakpoint
UPDATE "subscriptions" SET "periodo_pago_desde" = "current_period_end" - (CASE WHEN "ciclo" = 'anual' THEN 370 ELSE 35 END)::bigint * 86400000::bigint
  WHERE "provider" = 'asaas' AND "status" IN ('active', 'past_due') AND "current_period_end" IS NOT NULL AND "deleted_at" IS NULL;
