CREATE TABLE `credit_purchases` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`user_id` text,
	`deleted_at` integer,
	`sku` text NOT NULL,
	`creditos` integer NOT NULL,
	`valor_centavos` integer NOT NULL,
	`provider` text DEFAULT 'asaas' NOT NULL,
	`provider_payment_id` text,
	`status` text DEFAULT 'pendente' NOT NULL,
	`paid_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_credit_purchases_user` ON `credit_purchases` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_credit_purchases_payment` ON `credit_purchases` (`provider_payment_id`) WHERE "credit_purchases"."deleted_at" is null;--> statement-breakpoint
CREATE TABLE `credit_spends` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`user_id` text,
	`deleted_at` integer,
	`spend_id` text NOT NULL,
	`amount` integer NOT NULL,
	`reason` text NOT NULL,
	`ref` text
);
--> statement-breakpoint
CREATE INDEX `idx_credit_spends_spend_id` ON `credit_spends` (`spend_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_credit_spends_user_spend` ON `credit_spends` (`user_id`,`spend_id`) WHERE "credit_spends"."deleted_at" is null;