CREATE TABLE `subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`user_id` text,
	`deleted_at` integer,
	`plan` text DEFAULT 'free' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`current_period_end` integer,
	`cancel_at_period_end` integer,
	`provider` text,
	`provider_customer_id` text,
	`provider_subscription_id` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_subscriptions_user` ON `subscriptions` (`user_id`);--> statement-breakpoint
CREATE TABLE `usage_counters` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`user_id` text,
	`deleted_at` integer,
	`metric` text NOT NULL,
	`window` text NOT NULL,
	`count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_usage_user_metric_window` ON `usage_counters` (`user_id`,`metric`,`window`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`email` text,
	`role` text DEFAULT 'user' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL
);
