CREATE TABLE `plan_session` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`athlete_id` integer NOT NULL,
	`goal_id` integer NOT NULL,
	`date` text NOT NULL,
	`kind` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`optional` integer DEFAULT false NOT NULL,
	`key` integer DEFAULT false NOT NULL,
	`details` text NOT NULL,
	`phase` text NOT NULL,
	`week` integer NOT NULL,
	`moved` integer DEFAULT false NOT NULL,
	`skipped` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`athlete_id`) REFERENCES `athlete`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`goal_id`) REFERENCES `goal`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `plan_session_athlete_date_idx` ON `plan_session` (`athlete_id`,`date`);--> statement-breakpoint
CREATE TABLE `working_weight` (
	`athlete_id` integer NOT NULL,
	`exercise` text NOT NULL,
	`kg` real NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`athlete_id`) REFERENCES `athlete`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `working_weight_idx` ON `working_weight` (`athlete_id`,`exercise`);--> statement-breakpoint
ALTER TABLE `athlete` ADD `plan_prefs` text;