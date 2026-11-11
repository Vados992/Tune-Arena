CREATE TABLE `organizers` (
	`user_id` text PRIMARY KEY NOT NULL,
	`can_create` integer DEFAULT 0 NOT NULL,
	`granted_by` text NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `round_organizers` (
	`round_id` text NOT NULL,
	`user_id` text NOT NULL,
	`granted_by` text NOT NULL,
	`created` integer NOT NULL,
	PRIMARY KEY(`round_id`, `user_id`),
	FOREIGN KEY (`round_id`) REFERENCES `rounds`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `organizers`(`user_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `round_organizer_user` ON `round_organizers` (`user_id`,`round_id`);--> statement-breakpoint
CREATE TABLE `staff_events` (
	`id` text PRIMARY KEY NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`subject` text NOT NULL,
	`round_id` text,
	`created` integer NOT NULL,
	FOREIGN KEY (`round_id`) REFERENCES `rounds`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `staff_event_time` ON `staff_events` (`created`);