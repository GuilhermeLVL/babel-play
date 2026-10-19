ALTER TABLE `exercise_results` ADD `round_id` text;--> statement-breakpoint
ALTER TABLE `exercise_results` ADD `item_ref` text;--> statement-breakpoint
ALTER TABLE `exercise_results` ADD `attempts` integer;--> statement-breakpoint
ALTER TABLE `exercise_results` ADD `ms` integer;--> statement-breakpoint
ALTER TABLE `exercise_results` ADD `hinted` integer;--> statement-breakpoint
ALTER TABLE `exercise_results` ADD `origem` text;--> statement-breakpoint
CREATE INDEX `idx_exercise_results_item_ref` ON `exercise_results` (`item_ref`);--> statement-breakpoint
CREATE INDEX `idx_exercise_results_round_id` ON `exercise_results` (`round_id`);