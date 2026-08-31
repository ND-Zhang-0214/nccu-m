CREATE TABLE `human_checks` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_key` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `human_checks_token_hash_unique` ON `human_checks` (`token_hash`);--> statement-breakpoint
CREATE INDEX `hc_actor` ON `human_checks` (`actor_key`);