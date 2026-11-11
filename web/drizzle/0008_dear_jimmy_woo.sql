CREATE TABLE `avatars` (
	`owner` text PRIMARY KEY NOT NULL,
	`id` text NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `avatars_id_unique` ON `avatars` (`id`);