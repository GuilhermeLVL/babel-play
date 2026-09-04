CREATE TABLE `anki_media` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`user_id` text,
	`deleted_at` integer,
	`sha256` text NOT NULL,
	`bytes` integer NOT NULL,
	`content_type` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_anki_media_user` ON `anki_media` (`user_id`,`deleted_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_anki_media_user_sha256` ON `anki_media` (`user_id`,`sha256`);--> statement-breakpoint
CREATE TABLE `anki_note_media` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`user_id` text,
	`deleted_at` integer,
	`note_id` text NOT NULL,
	`media_id` text,
	`papel` text NOT NULL,
	`nome_original` text NOT NULL,
	FOREIGN KEY (`note_id`) REFERENCES `anki_notes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`media_id`) REFERENCES `anki_media`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_anki_note_media_note` ON `anki_note_media` (`note_id`);--> statement-breakpoint
CREATE INDEX `idx_anki_note_media_media` ON `anki_note_media` (`media_id`);