CREATE TABLE `agreement_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`doc_type` text NOT NULL,
	`version` text NOT NULL,
	`ip` text NOT NULL,
	`user_agent` text DEFAULT '' NOT NULL,
	`signed_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `applications` (
	`id` text PRIMARY KEY NOT NULL,
	`posting_id` text NOT NULL,
	`applicant_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`motivation` text NOT NULL,
	`payload` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`posting_id`) REFERENCES `postings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`applicant_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text,
	`action` text NOT NULL,
	`target_type` text DEFAULT '' NOT NULL,
	`target_id` text DEFAULT '' NOT NULL,
	`meta` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `colleges` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `departments` (
	`id` text PRIMARY KEY NOT NULL,
	`college_id` text NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`college_id`) REFERENCES `colleges`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `email_verifications` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`code` text NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `fields` (
	`id` text PRIMARY KEY NOT NULL,
	`department_id` text NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `postings` (
	`id` text PRIMARY KEY NOT NULL,
	`professor_id` text NOT NULL,
	`category` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`is_open` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`professor_id`) REFERENCES `professor_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `professor_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`display_name` text NOT NULL,
	`title` text DEFAULT '教授' NOT NULL,
	`department_id` text NOT NULL,
	`bio` text DEFAULT '' NOT NULL,
	`research_page` text DEFAULT '' NOT NULL,
	`is_open` integer DEFAULT true NOT NULL,
	`verify_status` text DEFAULT 'SEED' NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `professor_specialties` (
	`professor_id` text NOT NULL,
	`subfield_id` text NOT NULL,
	PRIMARY KEY(`professor_id`, `subfield_id`),
	FOREIGN KEY (`professor_id`) REFERENCES `professor_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`subfield_id`) REFERENCES `subfields`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`reporter_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`reason` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`outcome` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`reporter_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `subfields` (
	`id` text PRIMARY KEY NOT NULL,
	`field_id` text NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`field_id`) REFERENCES `fields`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text DEFAULT 'STUDENT_BACHELOR' NOT NULL,
	`sub_roles` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ag_user_doc` ON `agreement_logs` (`user_id`,`doc_type`);--> statement-breakpoint
CREATE UNIQUE INDEX `a_posting_applicant` ON `applications` (`posting_id`,`applicant_id`);--> statement-breakpoint
CREATE INDEX `a_applicant` ON `applications` (`applicant_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `al_time` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `colleges_name_unique` ON `colleges` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `colleges_slug_unique` ON `colleges` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `d_college_slug` ON `departments` (`college_id`,`slug`);--> statement-breakpoint
CREATE INDEX `d_college` ON `departments` (`college_id`);--> statement-breakpoint
CREATE INDEX `ev_email_code` ON `email_verifications` (`email`,`code`);--> statement-breakpoint
CREATE INDEX `f_dept` ON `fields` (`department_id`);--> statement-breakpoint
CREATE INDEX `po_open_cat` ON `postings` (`is_open`,`category`);--> statement-breakpoint
CREATE INDEX `po_prof` ON `postings` (`professor_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `professor_profiles_user_id_unique` ON `professor_profiles` (`user_id`);--> statement-breakpoint
CREATE INDEX `p_dept` ON `professor_profiles` (`department_id`);--> statement-breakpoint
CREATE INDEX `ps_sub` ON `professor_specialties` (`subfield_id`);--> statement-breakpoint
CREATE INDEX `r_status` ON `reports` (`status`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_hash_unique` ON `sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `s_user` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `sf_field` ON `subfields` (`field_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);