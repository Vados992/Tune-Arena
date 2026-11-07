CREATE TABLE `admin_events` (
	`id` text PRIMARY KEY NOT NULL,
	`round_id` text NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`target` text NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`round_id`) REFERENCES `rounds`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `admin_event_round_time` ON `admin_events` (`round_id`,`created`);--> statement-breakpoint
CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_id` text NOT NULL,
	`author` text NOT NULL,
	`body` text NOT NULL,
	`created` integer NOT NULL,
	`hidden` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `comment_entry_time` ON `comments` (`entry_id`,`created`);--> statement-breakpoint
CREATE INDEX `comment_author_time` ON `comments` (`author`,`created`);--> statement-breakpoint
ALTER TABLE `entries` ADD `hidden` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `profiles` ADD `nickname` text;--> statement-breakpoint
ALTER TABLE `profiles` ADD `nickname_key` text;--> statement-breakpoint
CREATE UNIQUE INDEX `profile_nickname_key` ON `profiles` (`nickname_key`);--> statement-breakpoint
ALTER TABLE `rounds` ADD `title` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `rounds` ADD `notice` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `rounds` ADD `prize` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `rounds` ADD `announced` integer DEFAULT 0 NOT NULL;