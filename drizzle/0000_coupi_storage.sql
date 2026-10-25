CREATE TABLE `account_members` (
	`profile_id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`json` text NOT NULL,
	`storage_version` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`json` text NOT NULL,
	`storage_version` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `response_cache` (
	`hash` text PRIMARY KEY NOT NULL,
	`json` text NOT NULL,
	`created_at` text NOT NULL
);
