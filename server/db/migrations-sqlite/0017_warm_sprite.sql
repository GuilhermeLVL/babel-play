CREATE TABLE `anki_decks` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`user_id` text,
	`deleted_at` integer,
	`nome` text NOT NULL,
	`nome_no_arquivo` text,
	`arquivo_origem` text NOT NULL,
	`estado` text DEFAULT 'ativo' NOT NULL,
	`idioma_origem` text,
	`idioma_alvo` text
);
--> statement-breakpoint
CREATE INDEX `idx_anki_decks_user` ON `anki_decks` (`user_id`,`deleted_at`);--> statement-breakpoint
CREATE TABLE `anki_imports` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`user_id` text,
	`deleted_at` integer,
	`deck_id` text NOT NULL,
	`arquivo` text,
	`bytes` integer,
	`hash_do_arquivo` text,
	`estado` text DEFAULT 'lendo' NOT NULL,
	`notas_lidas` integer DEFAULT 0 NOT NULL,
	`notas_novas` integer DEFAULT 0 NOT NULL,
	`notas_atualizadas` integer DEFAULT 0 NOT NULL,
	`notas_descartadas` integer DEFAULT 0 NOT NULL,
	`por_motivo` text,
	`erro` text,
	FOREIGN KEY (`deck_id`) REFERENCES `anki_decks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_anki_imports_user_deck` ON `anki_imports` (`user_id`,`deck_id`);--> statement-breakpoint
CREATE TABLE `anki_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`user_id` text,
	`deleted_at` integer,
	`deck_id` text NOT NULL,
	`guid` text NOT NULL,
	`notetype` text,
	`estrutura_hash` text,
	`campos_brutos` text,
	`frente` text,
	`verso` text,
	`exemplo` text,
	`tags` text,
	`estado` text DEFAULT 'arquivada' NOT NULL,
	`projected_card_id` text,
	`motivo_da_baixa` text,
	`motivo_descarte` text,
	`import_id` text,
	FOREIGN KEY (`deck_id`) REFERENCES `anki_decks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`projected_card_id`) REFERENCES `vocab_cards`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_anki_notes_user_deck` ON `anki_notes` (`user_id`,`deck_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_anki_notes_deck_guid` ON `anki_notes` (`deck_id`,`guid`);--> statement-breakpoint
CREATE INDEX `idx_anki_notes_deck_estado` ON `anki_notes` (`deck_id`,`estado`);