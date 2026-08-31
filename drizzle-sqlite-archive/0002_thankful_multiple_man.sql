CREATE TABLE `access_events` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_key` text NOT NULL,
	`resource_type` text NOT NULL,
	`resource_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `dual_approvals` (
	`id` text PRIMARY KEY NOT NULL,
	`requester_id` text NOT NULL,
	`action` text NOT NULL,
	`target_type` text DEFAULT '' NOT NULL,
	`target_id` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`approver_id` text,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`requester_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`approver_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `login_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`ip` text NOT NULL,
	`ok` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `security_events` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`severity` text DEFAULT 'medium' NOT NULL,
	`actor_id` text,
	`ip` text DEFAULT '' NOT NULL,
	`detail` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `agreement_logs` ADD `prev_hash` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `agreement_logs` ADD `hash` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `audit_logs` ADD `prev_hash` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `audit_logs` ADD `hash` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `sessions` ADD `last_used_at` integer DEFAULT (unixepoch()) NOT NULL;--> statement-breakpoint
ALTER TABLE `sessions` ADD `step_up_at` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `totp_secret_enc` text;--> statement-breakpoint
ALTER TABLE `users` ADD `totp_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `ae_actor_time` ON `access_events` (`actor_key`,`created_at`);--> statement-breakpoint
CREATE INDEX `da_status` ON `dual_approvals` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `la_email_time` ON `login_attempts` (`email`,`created_at`);--> statement-breakpoint
CREATE INDEX `la_ip_time` ON `login_attempts` (`ip`,`created_at`);--> statement-breakpoint
CREATE INDEX `se_type_time` ON `security_events` (`type`,`created_at`);