CREATE TABLE `account_lineage` (
	`id` text PRIMARY KEY NOT NULL,
	`from_account_id` text NOT NULL,
	`to_account_id` text NOT NULL,
	`link_type` text NOT NULL,
	`is_visible` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`from_account_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_account_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `al_from` ON `account_lineage` (`from_account_id`);--> statement-breakpoint
CREATE INDEX `al_to` ON `account_lineage` (`to_account_id`);--> statement-breakpoint
CREATE TABLE `professor_relinquishments` (
	`id` text PRIMARY KEY NOT NULL,
	`professor_id` text NOT NULL,
	`initiated_by_id` text NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`relinquish_at` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`professor_id`) REFERENCES `professor_profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`initiated_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `pr_status` ON `professor_relinquishments` (`status`,`relinquish_at`);--> statement-breakpoint
ALTER TABLE `postings` ADD `closed_reason` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `lifecycle_buffer_ends_at` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `lifecycle_note` text DEFAULT '' NOT NULL;