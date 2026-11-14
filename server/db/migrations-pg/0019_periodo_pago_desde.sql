-- COTA PELO PERÍODO PAGO (change `cota-pelo-periodo-pago`): uma coluna nula, EXPAND.
--   `subscriptions.periodo_pago_desde`: o vencimento (ms) da cobrança que concedeu o período em vigor (no 12x, o da 1ª
--   parcela). Gravado SÓ pela aplicação de um pagamento (`server/lib/billingEventos.ts`), no mesmo upsert do
--   `current_period_end`. É a âncora da janela da cota de quem paga: o cancelamento fora dos 7 dias, o estorno e o admin
--   mexem no `current_period_end`, e a âncora não pode andar com eles (senão cancelar zeraria a cota).
-- BACKFILL, uma vez: as linhas do Asaas em dia ou em atraso com período recebem o início derivado do fim gravado (35 dias
--   no mensal, 370 no anual). As canceladas ficam nulas (o fim delas pode ter sido mexido pelo cancelamento) e seguem na
--   janela do mês do calendário até o próximo pagamento. Par SQLite: 0061.
-- REVERSÃO: `ALTER TABLE "subscriptions" DROP COLUMN "periodo_pago_desde"` — só depois de voltar o código que a lê.
ALTER TABLE "subscriptions" ADD COLUMN "periodo_pago_desde" bigint;--> statement-breakpoint
UPDATE "subscriptions" SET "periodo_pago_desde" = "current_period_end" - (CASE WHEN "ciclo" = 'anual' THEN 370 ELSE 35 END) * 86400000
  WHERE "provider" = 'asaas' AND "status" IN ('active', 'past_due') AND "current_period_end" IS NOT NULL AND "deleted_at" IS NULL;
