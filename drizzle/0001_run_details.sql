CREATE TABLE `best_effort` (
	`id` text PRIMARY KEY NOT NULL,
	`activity_id` text NOT NULL,
	`athlete_id` integer NOT NULL,
	`name` text NOT NULL,
	`distance` real NOT NULL,
	`elapsed_time` integer NOT NULL,
	`start_date_local` text NOT NULL,
	FOREIGN KEY (`activity_id`) REFERENCES `activity`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`athlete_id`) REFERENCES `athlete`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `best_effort_athlete_name_idx` ON `best_effort` (`athlete_id`,`name`);--> statement-breakpoint
CREATE TABLE `performance` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`athlete_id` integer NOT NULL,
	`date` text NOT NULL,
	`name` text NOT NULL,
	`distance` real NOT NULL,
	`time` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`athlete_id`) REFERENCES `athlete`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `activity` ADD `detail_fetched_at` integer;--> statement-breakpoint
ALTER TABLE `activity` ADD `splits` text;--> statement-breakpoint
ALTER TABLE `activity` ADD `laps` text;--> statement-breakpoint
ALTER TABLE `athlete` ADD `pace_overrides` text;--> statement-breakpoint
ALTER TABLE `athlete` ADD `ref_hr` integer;--> statement-breakpoint
DELETE FROM `activity` WHERE `start_date` < '2008-01-01';
