CREATE TABLE `activity` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`source_id` text NOT NULL,
	`athlete_id` integer NOT NULL,
	`name` text NOT NULL,
	`sport_type` text NOT NULL,
	`start_date` text NOT NULL,
	`start_date_local` text NOT NULL,
	`moving_time` integer NOT NULL,
	`elapsed_time` integer NOT NULL,
	`distance` real DEFAULT 0 NOT NULL,
	`elevation_gain` real DEFAULT 0 NOT NULL,
	`avg_hr` real,
	`max_hr` real,
	`relative_effort` integer,
	`workout_type` integer,
	`trainer` integer DEFAULT false NOT NULL,
	`raw` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`athlete_id`) REFERENCES `athlete`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `activity_source_idx` ON `activity` (`source`,`source_id`);--> statement-breakpoint
CREATE INDEX `activity_athlete_start_idx` ON `activity` (`athlete_id`,`start_date`);--> statement-breakpoint
CREATE TABLE `athlete` (
	`id` integer PRIMARY KEY NOT NULL,
	`first_name` text,
	`last_name` text,
	`weight_kg` real,
	`units` text DEFAULT 'metric' NOT NULL,
	`max_hr` integer,
	`rest_hr` integer,
	`hr_zones` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`athlete_id` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`athlete_id`) REFERENCES `athlete`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `strava_token` (
	`athlete_id` integer PRIMARY KEY NOT NULL,
	`access_token` text NOT NULL,
	`refresh_token` text NOT NULL,
	`expires_at` integer NOT NULL,
	`scope` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`athlete_id`) REFERENCES `athlete`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sync_state` (
	`athlete_id` integer PRIMARY KEY NOT NULL,
	`cursor` integer DEFAULT 0 NOT NULL,
	`last_sync_at` integer,
	`last_error` text,
	`backfill_complete` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`athlete_id`) REFERENCES `athlete`(`id`) ON UPDATE no action ON DELETE cascade
);
