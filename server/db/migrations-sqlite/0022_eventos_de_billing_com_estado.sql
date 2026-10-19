ALTER TABLE `billing_events` ADD `estado` text DEFAULT 'aplicado' NOT NULL;--> statement-breakpoint
ALTER TABLE `billing_events` ADD `motivo` text;--> statement-breakpoint
ALTER TABLE `billing_events` ADD `payload` text;