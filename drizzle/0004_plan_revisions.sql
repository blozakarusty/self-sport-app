CREATE TABLE `plan_revision` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`athlete_id` integer NOT NULL,
	`goal_id` integer NOT NULL,
	`reviewed_week` text NOT NULL,
	`decision` text NOT NULL,
	`factor` real NOT NULL,
	`reasons` text NOT NULL,
	`metrics` text NOT NULL,
	`changes` text NOT NULL,
	`before` text,
	`explanation` text NOT NULL,
	`tips` text NOT NULL,
	`source` text NOT NULL,
	`undone` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`athlete_id`) REFERENCES `athlete`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`goal_id`) REFERENCES `goal`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plan_revision_week_idx` ON `plan_revision` (`athlete_id`,`reviewed_week`);