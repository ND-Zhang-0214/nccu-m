CREATE TABLE `data_export_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`downloaded_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `data_export_tokens_token_hash_unique` ON `data_export_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `det_user` ON `data_export_tokens` (`user_id`);--> statement-breakpoint
CREATE TABLE `posting_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`posting_id` text NOT NULL,
	`version_number` integer NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`structured_fields` text DEFAULT '{}' NOT NULL,
	`edited_by_user_id` text NOT NULL,
	`edited_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`posting_id`) REFERENCES `postings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`edited_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `pv_posting` ON `posting_versions` (`posting_id`,`version_number`);--> statement-breakpoint
CREATE TABLE `unit_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`contact_email` text NOT NULL,
	`extension` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `unit_profiles_user_id_unique` ON `unit_profiles` (`user_id`);--> statement-breakpoint
CREATE TABLE `user_hides` (
	`id` text PRIMARY KEY NOT NULL,
	`hider_user_id` text NOT NULL,
	`hidden_user_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`hider_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`hidden_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uh_pair` ON `user_hides` (`hider_user_id`,`hidden_user_id`);--> statement-breakpoint
CREATE INDEX `uh_hider` ON `user_hides` (`hider_user_id`);--> statement-breakpoint
CREATE INDEX `uh_hidden` ON `user_hides` (`hidden_user_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_postings` (
	`id` text PRIMARY KEY NOT NULL,
	`poster_type` text DEFAULT 'PROFESSOR' NOT NULL,
	`professor_id` text,
	`unit_id` text,
	`student_poster_id` text,
	`category` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`structured_fields` text DEFAULT '{}' NOT NULL,
	`is_open` integer DEFAULT true NOT NULL,
	`closed_reason` text DEFAULT '' NOT NULL,
	`current_version` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`professor_id`) REFERENCES `professor_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`unit_id`) REFERENCES `unit_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_poster_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
-- 注意(手動修正):drizzle-kit 產生的原始版本在這裡直接 SELECT 新欄位(poster_type 等),
-- 但這些欄位是本次遷移才新增的,舊版 postings 表尚不存在這些欄位,會導致遷移失敗。
-- 改為只搬移舊表已有的欄位,新欄位一律吃 __new_postings 定義好的 DEFAULT 值即可,語意相同。
INSERT INTO `__new_postings`("id", "professor_id", "category", "title", "description", "is_open", "closed_reason", "created_at") SELECT "id", "professor_id", "category", "title", "description", "is_open", "closed_reason", "created_at" FROM `postings`;--> statement-breakpoint
DROP TABLE `postings`;--> statement-breakpoint
ALTER TABLE `__new_postings` RENAME TO `postings`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `po_open_cat` ON `postings` (`is_open`,`category`);--> statement-breakpoint
CREATE INDEX `po_prof` ON `postings` (`professor_id`);--> statement-breakpoint
CREATE INDEX `po_unit` ON `postings` (`unit_id`);--> statement-breakpoint
CREATE INDEX `po_student` ON `postings` (`student_poster_id`);--> statement-breakpoint
ALTER TABLE `applications` ADD `applied_at_version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `attachments` ADD `group_id` text REFERENCES groups(id);--> statement-breakpoint
CREATE INDEX `att_group` ON `attachments` (`group_id`);--> statement-breakpoint
ALTER TABLE `sessions` ADD `user_agent` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `sessions` ADD `created_ip` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `sessions` ADD `provider` text DEFAULT 'mock-email-code' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `real_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `degree_level` text;--> statement-breakpoint
ALTER TABLE `users` ADD `degree_level_verified_at` integer;