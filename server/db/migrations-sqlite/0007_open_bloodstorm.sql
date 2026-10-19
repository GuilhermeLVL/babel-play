CREATE TABLE `vocab_occurrences` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`card_id` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`origin_kind` text NOT NULL,
	`origin_ref` text,
	`sentence` text,
	`utterance_id` text
);
--> statement-breakpoint
CREATE INDEX `idx_occ_user_card` ON `vocab_occurrences` (`user_id`,`card_id`);--> statement-breakpoint
CREATE INDEX `idx_occ_user_time` ON `vocab_occurrences` (`user_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `idx_occ_origem` ON `vocab_occurrences` (`user_id`,`origin_kind`,`origin_ref`);--> statement-breakpoint
ALTER TABLE `exercise_results` ADD `card_id` text;--> statement-breakpoint
CREATE INDEX `idx_exercise_results_card` ON `exercise_results` (`user_id`,`card_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `vocab_cards` ADD `norm_key` text;--> statement-breakpoint
ALTER TABLE `vocab_cards` ADD `occurrences` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `vocab_cards` ADD `first_seen_at` integer;--> statement-breakpoint
ALTER TABLE `vocab_cards` ADD `last_seen_at` integer;--> statement-breakpoint
ALTER TABLE `vocab_cards` ADD `cefr_source` text;--> statement-breakpoint
ALTER TABLE `vocab_cards` ADD `difficulty_score` real;--> statement-breakpoint
ALTER TABLE `vocab_cards` ADD `difficulty_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_vocab_user_norm` ON `vocab_cards` (`user_id`,`norm_key`) WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX `idx_vocab_user_added` ON `vocab_cards` (`user_id`,`added_at`);--> statement-breakpoint
CREATE INDEX `idx_vocab_user_occ` ON `vocab_cards` (`user_id`,`occurrences`);--> statement-breakpoint
CREATE INDEX `idx_vocab_user_cefr` ON `vocab_cards` (`user_id`,`cefr_level`);--> statement-breakpoint
CREATE INDEX `idx_vocab_user_due` ON `vocab_cards` (`user_id`,`due_at`);--> statement-breakpoint
CREATE INDEX `idx_vocab_session` ON `vocab_cards` (`user_id`,`session_id`);--> statement-breakpoint
CREATE INDEX `idx_vocab_user_dificuldade` ON `vocab_cards` (`user_id`,`difficulty_score`);--> statement-breakpoint
CREATE INDEX `idx_review_card` ON `review_logs` (`card_id`,`reviewed_at`);--> statement-breakpoint
CREATE INDEX `idx_utt_session` ON `utterances` (`session_id`,`idx`);