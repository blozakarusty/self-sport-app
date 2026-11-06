CREATE TABLE `benchmark` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`athlete_id` integer NOT NULL,
	`key` text,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`unit` text NOT NULL,
	`better` text NOT NULL,
	`target` real,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`athlete_id`) REFERENCES `athlete`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `benchmark_result` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`benchmark_id` integer NOT NULL,
	`date` text NOT NULL,
	`value` real NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`benchmark_id`) REFERENCES `benchmark`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `benchmark_result_idx` ON `benchmark_result` (`benchmark_id`,`date`);--> statement-breakpoint
CREATE TABLE `goal` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`athlete_id` integer NOT NULL,
	`name` text NOT NULL,
	`distance` real NOT NULL,
	`elevation_gain` real DEFAULT 0 NOT NULL,
	`date` text NOT NULL,
	`target_time` integer NOT NULL,
	`start_date` text NOT NULL,
	`start_vdot` real,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`athlete_id`) REFERENCES `athlete`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `activity` ADD `strength_split` text;--> statement-breakpoint
ALTER TABLE `activity` ADD `rpe` integer;