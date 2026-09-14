CREATE TABLE `accounts` (
	`username` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`role` text NOT NULL,
	`salt` text NOT NULL,
	`hash` text NOT NULL,
	`disabled` integer DEFAULT 0 NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_accounts_active` ON `accounts` (`disabled`,`role`);--> statement-breakpoint
CREATE TABLE `change_history` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`target` text NOT NULL,
	`before_payload` text NOT NULL,
	`after_version` text NOT NULL,
	`action` text NOT NULL,
	`username` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_changes_target` ON `change_history` (`kind`,`target`,`created_at`);--> statement-breakpoint
CREATE TABLE `sso_tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `files` ADD `revision` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `reports` ADD `published_payload` text;--> statement-breakpoint
ALTER TABLE `reports` ADD `published_at` text;--> statement-breakpoint
ALTER TABLE `reports` ADD `deleted_at` text;--> statement-breakpoint
ALTER TABLE `section_archives` ADD `archived` integer DEFAULT 0 NOT NULL;