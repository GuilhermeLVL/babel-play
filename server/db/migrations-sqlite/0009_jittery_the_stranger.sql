CREATE INDEX `idx_review_user` ON `review_logs` (`user_id`,`reviewed_at`);--> statement-breakpoint
CREATE INDEX `idx_sessions_user` ON `sessions` (`user_id`,`deleted_at`);--> statement-breakpoint
CREATE INDEX `idx_utt_user` ON `utterances` (`user_id`,`deleted_at`);