CREATE TABLE `billing_events` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`provider` text NOT NULL,
	`event` text NOT NULL,
	`user_id` text,
	`provider_ref` text
);
