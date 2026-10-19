DROP TABLE `memory_embeddings`;--> statement-breakpoint
ALTER TABLE `secrets` ADD `user_id` text;--> statement-breakpoint
ALTER TABLE `secrets` ADD `deleted_at` integer;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_vocab_occurrences` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`user_id` text NOT NULL,
	`deleted_at` integer,
	`card_id` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`origin_kind` text NOT NULL,
	`origin_ref` text,
	`sentence` text,
	`utterance_id` text,
	FOREIGN KEY (`card_id`) REFERENCES `vocab_cards`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`utterance_id`) REFERENCES `utterances`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
-- EDITADO À MÃO. O drizzle-kit gerou `SELECT "created_at", "updated_at", "deleted_at" FROM
-- vocab_occurrences` — colunas que a tabela ANTIGA não tem; a migração falharia em "no such
-- column". `occurred_at` é o carimbo honesto para as 2.233 linhas existentes (é quando a linha
-- passou a existir), e `deleted_at` nasce NULL: nenhuma ocorrência antiga foi apagada.
INSERT INTO `__new_vocab_occurrences`("id", "created_at", "updated_at", "user_id", "deleted_at", "card_id", "occurred_at", "origin_kind", "origin_ref", "sentence", "utterance_id") SELECT "id", "occurred_at", "occurred_at", "user_id", NULL, "card_id", "occurred_at", "origin_kind", "origin_ref", "sentence", "utterance_id" FROM `vocab_occurrences`;--> statement-breakpoint
DROP TABLE `vocab_occurrences`;--> statement-breakpoint
ALTER TABLE `__new_vocab_occurrences` RENAME TO `vocab_occurrences`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_occ_user_card` ON `vocab_occurrences` (`user_id`,`card_id`);--> statement-breakpoint
CREATE INDEX `idx_occ_user_time` ON `vocab_occurrences` (`user_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `idx_occ_origem` ON `vocab_occurrences` (`user_id`,`origin_kind`,`origin_ref`);--> statement-breakpoint
CREATE TABLE `__new_analyses` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`user_id` text,
	`deleted_at` integer,
	`session_id` text NOT NULL,
	`analyzed_at` integer,
	`provider_id` text,
	`analysis` text,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_analyses`("id", "created_at", "updated_at", "user_id", "deleted_at", "session_id", "analyzed_at", "provider_id", "analysis") SELECT "id", "created_at", "updated_at", "user_id", "deleted_at", "session_id", "analyzed_at", "provider_id", "analysis" FROM `analyses`;--> statement-breakpoint
DROP TABLE `analyses`;--> statement-breakpoint
ALTER TABLE `__new_analyses` RENAME TO `analyses`;--> statement-breakpoint
CREATE TABLE `__new_exercise_results` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`user_id` text,
	`deleted_at` integer,
	`session_id` text,
	`kind` text,
	`correct` integer,
	`score` real,
	`exercise_kind` text,
	`round_id` text,
	`item_ref` text,
	`attempts` integer,
	`ms` integer,
	`hinted` integer,
	`origem` text,
	`card_id` text,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`card_id`) REFERENCES `vocab_cards`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_exercise_results`("id", "created_at", "updated_at", "user_id", "deleted_at", "session_id", "kind", "correct", "score", "exercise_kind", "round_id", "item_ref", "attempts", "ms", "hinted", "origem", "card_id") SELECT "id", "created_at", "updated_at", "user_id", "deleted_at", "session_id", "kind", "correct", "score", "exercise_kind", "round_id", "item_ref", "attempts", "ms", "hinted", "origem", "card_id" FROM `exercise_results`;--> statement-breakpoint
DROP TABLE `exercise_results`;--> statement-breakpoint
ALTER TABLE `__new_exercise_results` RENAME TO `exercise_results`;--> statement-breakpoint
CREATE INDEX `idx_exercise_results_item_ref` ON `exercise_results` (`item_ref`);--> statement-breakpoint
CREATE INDEX `idx_exercise_results_round_id` ON `exercise_results` (`round_id`);--> statement-breakpoint
CREATE INDEX `idx_exercise_results_kind_round` ON `exercise_results` (`exercise_kind`,`round_id`);--> statement-breakpoint
CREATE INDEX `idx_exercise_results_card` ON `exercise_results` (`user_id`,`card_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `__new_provider_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`user_id` text,
	`deleted_at` integer,
	`label` text,
	`kind` text,
	`base_url` text,
	`default_model` text,
	`secret_ref` text,
	FOREIGN KEY (`secret_ref`) REFERENCES `secrets`(`ref`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_provider_credentials`("id", "created_at", "updated_at", "user_id", "deleted_at", "label", "kind", "base_url", "default_model", "secret_ref") SELECT "id", "created_at", "updated_at", "user_id", "deleted_at", "label", "kind", "base_url", "default_model", "secret_ref" FROM `provider_credentials`;--> statement-breakpoint
DROP TABLE `provider_credentials`;--> statement-breakpoint
ALTER TABLE `__new_provider_credentials` RENAME TO `provider_credentials`;--> statement-breakpoint
CREATE TABLE `__new_review_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`user_id` text,
	`deleted_at` integer,
	`card_id` text NOT NULL,
	`reviewed_at` integer,
	`grade` integer,
	`prev_stability` real,
	`new_stability` real,
	`prev_due` integer,
	`new_due` integer,
	`elapsed_days` real,
	FOREIGN KEY (`card_id`) REFERENCES `vocab_cards`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_review_logs`("id", "created_at", "updated_at", "user_id", "deleted_at", "card_id", "reviewed_at", "grade", "prev_stability", "new_stability", "prev_due", "new_due", "elapsed_days") SELECT "id", "created_at", "updated_at", "user_id", "deleted_at", "card_id", "reviewed_at", "grade", "prev_stability", "new_stability", "prev_due", "new_due", "elapsed_days" FROM `review_logs`;--> statement-breakpoint
DROP TABLE `review_logs`;--> statement-breakpoint
ALTER TABLE `__new_review_logs` RENAME TO `review_logs`;--> statement-breakpoint
CREATE INDEX `idx_review_card` ON `review_logs` (`card_id`,`reviewed_at`);--> statement-breakpoint
CREATE INDEX `idx_review_user` ON `review_logs` (`user_id`,`reviewed_at`);--> statement-breakpoint
CREATE TABLE `__new_utterances` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`user_id` text,
	`deleted_at` integer,
	`session_id` text NOT NULL,
	`idx` integer,
	`t_start_ms` integer,
	`t_end_ms` integer,
	`speaker_id` text,
	`speaker_name` text,
	`source` text,
	`source_lang` text,
	`source_text` text,
	`target_lang` text,
	`translated_text` text,
	`status` text,
	`engine` text,
	`confidence` real,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_utterances`("id", "created_at", "updated_at", "user_id", "deleted_at", "session_id", "idx", "t_start_ms", "t_end_ms", "speaker_id", "speaker_name", "source", "source_lang", "source_text", "target_lang", "translated_text", "status", "engine", "confidence") SELECT "id", "created_at", "updated_at", "user_id", "deleted_at", "session_id", "idx", "t_start_ms", "t_end_ms", "speaker_id", "speaker_name", "source", "source_lang", "source_text", "target_lang", "translated_text", "status", "engine", "confidence" FROM `utterances`;--> statement-breakpoint
DROP TABLE `utterances`;--> statement-breakpoint
ALTER TABLE `__new_utterances` RENAME TO `utterances`;--> statement-breakpoint
CREATE INDEX `idx_utt_session` ON `utterances` (`session_id`,`idx`);--> statement-breakpoint
CREATE INDEX `idx_utt_user` ON `utterances` (`user_id`,`deleted_at`);--> statement-breakpoint
CREATE TABLE `__new_vocab_cards` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`user_id` text,
	`deleted_at` integer,
	`session_id` text,
	`word` text NOT NULL,
	`back` text,
	`phonetics` text,
	`sentence` text,
	`src_lang` text,
	`tgt_lang` text,
	`frequency` integer,
	`in_deck` integer,
	`box` integer,
	`due_at` integer,
	`stability` real,
	`difficulty` real,
	`reps` integer,
	`lapses` integer,
	`last_review` integer,
	`cloze_prompt` text,
	`cloze_answer` text,
	`cefr_level` text,
	`cefr_confidence` real,
	`added_at` integer,
	`norm_key` text,
	`occurrences` integer DEFAULT 0 NOT NULL,
	`first_seen_at` integer,
	`last_seen_at` integer,
	`cefr_source` text,
	`difficulty_score` real,
	`difficulty_at` integer,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_vocab_cards`("id", "created_at", "updated_at", "user_id", "deleted_at", "session_id", "word", "back", "phonetics", "sentence", "src_lang", "tgt_lang", "frequency", "in_deck", "box", "due_at", "stability", "difficulty", "reps", "lapses", "last_review", "cloze_prompt", "cloze_answer", "cefr_level", "cefr_confidence", "added_at", "norm_key", "occurrences", "first_seen_at", "last_seen_at", "cefr_source", "difficulty_score", "difficulty_at") SELECT "id", "created_at", "updated_at", "user_id", "deleted_at", "session_id", "word", "back", "phonetics", "sentence", "src_lang", "tgt_lang", "frequency", "in_deck", "box", "due_at", "stability", "difficulty", "reps", "lapses", "last_review", "cloze_prompt", "cloze_answer", "cefr_level", "cefr_confidence", "added_at", "norm_key", "occurrences", "first_seen_at", "last_seen_at", "cefr_source", "difficulty_score", "difficulty_at" FROM `vocab_cards`;--> statement-breakpoint
DROP TABLE `vocab_cards`;--> statement-breakpoint
ALTER TABLE `__new_vocab_cards` RENAME TO `vocab_cards`;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_vocab_user_norm` ON `vocab_cards` (`user_id`,`norm_key`) WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX `idx_vocab_user_added` ON `vocab_cards` (`user_id`,`added_at`);--> statement-breakpoint
CREATE INDEX `idx_vocab_user_occ` ON `vocab_cards` (`user_id`,`occurrences`);--> statement-breakpoint
CREATE INDEX `idx_vocab_user_cefr` ON `vocab_cards` (`user_id`,`cefr_level`);--> statement-breakpoint
CREATE INDEX `idx_vocab_user_due` ON `vocab_cards` (`user_id`,`due_at`);--> statement-breakpoint
CREATE INDEX `idx_vocab_session` ON `vocab_cards` (`user_id`,`session_id`);--> statement-breakpoint
CREATE INDEX `idx_vocab_user_dificuldade` ON `vocab_cards` (`user_id`,`difficulty_score`);