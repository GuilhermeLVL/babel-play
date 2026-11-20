CREATE TABLE `seed_spends` (
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
CREATE UNIQUE INDEX `seed_spends_spend_id_unique` ON `seed_spends` (`spend_id`);--> statement-breakpoint
CREATE INDEX `idx_seed_spends_spend_id` ON `seed_spends` (`spend_id`);