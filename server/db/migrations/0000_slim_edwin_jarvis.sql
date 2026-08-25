CREATE TABLE `analyses` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`user_id` text,
	`deleted_at` integer,
	`session_id` text NOT NULL,
	`analyzed_at` integer,
	`provider_id` text,
	`analysis` text
);
--> statement-breakpoint
CREATE TABLE `exercise_results` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`user_id` text,
	`deleted_at` integer,
	`session_id` text,
	`kind` text,
	`correct` integer,
	`score` real,
	`exercise_kind` text
);
--> statement-breakpoint
CREATE TABLE `memory_embeddings` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`user_id` text,
	`deleted_at` integer,
	`utterance_id` text,
	`session_id` text,
	`text` text,
	`vector` blob,
	`dim` integer,
	`model` text
);
--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`user_id` text,
	`deleted_at` integer,
	`name` text NOT NULL,
	`builtin` integer,
	`bindings` text,
	`budget` text,
	`economy_mode` integer
);
--> statement-breakpoint
CREATE TABLE `provider_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`user_id` text,
	`deleted_at` integer,
	`label` text,
	`kind` text,
	`base_url` text,
	`default_model` text,
	`secret_ref` text
);
--> statement-breakpoint
CREATE TABLE `review_logs` (
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
	`elapsed_days` real
);
--> statement-breakpoint
CREATE TABLE `secrets` (
	`ref` text PRIMARY KEY NOT NULL,
	`value_encrypted` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`user_id` text,
	`deleted_at` integer,
	`title` text,
	`kind` text,
	`started_at` integer,
	`ended_at` integer,
	`source_lang` text,
	`target_lang` text,
	`duration_ms` integer,
	`word_count` integer,
	`status` text,
	`meta` text
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`user_id` text,
	`deleted_at` integer,
	`active_profile_id` text,
	`target_language` text,
	`ui` text
);
--> statement-breakpoint
CREATE TABLE `utterances` (
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
	`confidence` real
);
--> statement-breakpoint
CREATE TABLE `vocab_cards` (
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
	`added_at` integer
);
