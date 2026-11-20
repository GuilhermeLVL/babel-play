CREATE TABLE `presencas` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`user_id` text,
	`deleted_at` integer,
	`dia` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_presencas_user_dia` ON `presencas` (`user_id`,`dia`) WHERE "presencas"."deleted_at" is null;--> statement-breakpoint
CREATE TABLE `seed_credits` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`user_id` text,
	`deleted_at` integer,
	`credito_id` text NOT NULL,
	`amount` integer NOT NULL,
	`xp` integer DEFAULT 0 NOT NULL,
	`reason` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_seed_credits_credito_id` ON `seed_credits` (`credito_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_seed_credits_user_credito` ON `seed_credits` (`user_id`,`credito_id`) WHERE "seed_credits"."deleted_at" is null;