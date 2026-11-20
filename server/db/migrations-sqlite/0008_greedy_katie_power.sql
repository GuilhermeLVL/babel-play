CREATE TABLE `user_interests` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`user_id` text,
	`deleted_at` integer,
	`slug` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_user_interest` ON `user_interests` (`user_id`,`slug`) WHERE "user_interests"."deleted_at" is null;--> statement-breakpoint
ALTER TABLE `users` ADD `display_name` text;--> statement-breakpoint
ALTER TABLE `users` ADD `locale` text;--> statement-breakpoint
ALTER TABLE `users` ADD `bio` text;--> statement-breakpoint
ALTER TABLE `users` ADD `goal` text;--> statement-breakpoint
ALTER TABLE `users` ADD `onboarded_at` integer;