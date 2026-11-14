-- COTA PELO PERÍODO PAGO (change `cota-pelo-periodo-pago`) — par SQLite da PG 0019. Uma coluna anulável (expand):
--   `subscriptions.periodo_pago_desde`: o vencimento (ms) da cobrança que concedeu o período em vigor, gravado SÓ pela
--   aplicação de um pagamento (`server/lib/billingEventos.ts`). Âncora da janela da cota de quem paga; o cancelamento,
--   o estorno e o admin mexem no `current_period_end`, nunca aqui. Backfill das linhas do Asaas em dia ou em atraso.
-- REVERSÃO: `ALTER TABLE subscriptions DROP COLUMN periodo_pago_desde` — só depois de voltar o código que a lê.
ALTER TABLE `subscriptions` ADD `periodo_pago_desde` integer;--> statement-breakpoint
UPDATE `subscriptions` SET `periodo_pago_desde` = `current_period_end` - (CASE WHEN `ciclo` = 'anual' THEN 370 ELSE 35 END) * 86400000
  WHERE `provider` = 'asaas' AND `status` IN ('active', 'past_due') AND `current_period_end` IS NOT NULL AND `deleted_at` IS NULL;
