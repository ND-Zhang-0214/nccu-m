CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`application_id` text,
	`original_name` text DEFAULT '' NOT NULL,
	`stored_filename` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`scan_status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attachments_stored_filename_unique` ON `attachments` (`stored_filename`);--> statement-breakpoint
CREATE INDEX `att_owner` ON `attachments` (`owner_id`);--> statement-breakpoint
CREATE INDEX `att_app` ON `attachments` (`application_id`);--> statement-breakpoint
CREATE TABLE `file_download_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`attachment_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`attachment_id`) REFERENCES `attachments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `file_download_tokens_token_hash_unique` ON `file_download_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `fdt_att` ON `file_download_tokens` (`attachment_id`);