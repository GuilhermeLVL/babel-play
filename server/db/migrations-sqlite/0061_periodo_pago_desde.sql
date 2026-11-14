-- COTA PELO PERÍODO PAGO (change `cota-pelo-periodo-pago`) — par SQLite da PG 0019. Expand: duas colunas anuláveis e
-- dois índices.
--   `subscriptions.periodo_pago_desde`: o vencimento (ms) da cobrança que concedeu o período em vigor, gravado SÓ pela
--   aplicação de um pagamento (`server/lib/billingEventos.ts`). Âncora da janela da cota de quem paga; o cancelamento,
--   o estorno e o admin mexem no `current_period_end`, nunca aqui. Backfill das linhas do Asaas em dia ou em atraso
--   (no SQLite o inteiro é de 64 bits: a conta dias × ms não estoura, ao contrário do `int4` do Postgres).
--   `subscriptions.ciclo_da_cobranca`: o ciclo da cobrança registrada, gravado por `/assinar`.
--   `billing_events (user_id, event)` e `(provider_ref)`: a busca da duplicata do estorno e a da reconciliação.
-- REVERSÃO: `DROP INDEX idx_billing_events_user_event`, `DROP INDEX idx_billing_events_provider_ref`,
-- `ALTER TABLE subscriptions DROP COLUMN periodo_pago_desde` e `DROP COLUMN ciclo_da_cobranca`.
ALTER TABLE `subscriptions` ADD `periodo_pago_desde` integer;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `ciclo_da_cobranca` text;--> statement-breakpoint
CREATE INDEX `idx_billing_events_user_event` ON `billing_events` (`user_id`,`event`);--> statement-breakpoint
CREATE INDEX `idx_billing_events_provider_ref` ON `billing_events` (`provider_ref`);--> statement-breakpoint
UPDATE `subscriptions` SET `periodo_pago_desde` = `current_period_end` - (CASE WHEN `ciclo` = 'anual' THEN 370 ELSE 35 END) * 86400000
  WHERE `provider` = 'asaas' AND `status` IN ('active', 'past_due') AND `current_period_end` IS NOT NULL AND `deleted_at` IS NULL;
