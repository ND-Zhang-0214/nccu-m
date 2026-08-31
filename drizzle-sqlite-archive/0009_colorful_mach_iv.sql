CREATE TABLE `professor_intake_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`professor_id` text NOT NULL,
	`type` text NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`condition_text` text DEFAULT '' NOT NULL,
	`quota_note` text DEFAULT '' NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`professor_id`) REFERENCES `professor_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pis_prof_type` ON `professor_intake_settings` (`professor_id`,`type`);--> statement-breakpoint
CREATE TABLE `student_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`student_id` text NOT NULL,
	`professor_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`payload` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`status_updated_at` integer,
	FOREIGN KEY (`student_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`professor_id`) REFERENCES `professor_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sr_prof_status` ON `student_requests` (`professor_id`,`status`);--> statement-breakpoint
CREATE INDEX `sr_student` ON `student_requests` (`student_id`,`created_at`);