CREATE TABLE `group_members` (
	`group_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`joined_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`group_id`, `user_id`),
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `gm_user` ON `group_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `group_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`author_id` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `gp_group` ON `group_posts` (`group_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `groups` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `ics_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ics_tokens_token_hash_unique` ON `ics_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `ics_user` ON `ics_tokens` (`user_id`);--> statement-breakpoint
CREATE TABLE `interview_slots` (
	`id` text PRIMARY KEY NOT NULL,
	`posting_id` text NOT NULL,
	`professor_id` text NOT NULL,
	`start_at` integer NOT NULL,
	`end_at` integer NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`is_booked` integer DEFAULT false NOT NULL,
	`application_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`posting_id`) REFERENCES `postings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`professor_id`) REFERENCES `professor_profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `is_posting` ON `interview_slots` (`posting_id`,`is_booked`);--> statement-breakpoint
ALTER TABLE `applications` ADD `motivation_summary` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `applications` ADD `status_updated_at` integer;--> statement-breakpoint
ALTER TABLE `reports` ADD `resolved_at` integer;