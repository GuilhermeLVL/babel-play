DROP INDEX `uq_seed_spends_user_spend`;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_seed_spends_user_spend` ON `seed_spends` (`user_id`,`spend_id`) WHERE "seed_spends"."deleted_at" is null;--> statement-breakpoint
DROP INDEX `uq_settings_user`;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_settings_user` ON `settings` (`user_id`) WHERE "settings"."deleted_at" is null;