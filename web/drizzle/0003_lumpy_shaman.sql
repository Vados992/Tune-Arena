CREATE TABLE `referral_codes` (
	`user_id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `referral_code_unique` ON `referral_codes` (`code`);--> statement-breakpoint
CREATE TABLE `referral_rewards` (
	`inviter` text PRIMARY KEY NOT NULL,
	`batches` integer DEFAULT 0 NOT NULL,
	`credited_batches` integer DEFAULT 0 NOT NULL,
	`notified_batches` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`inviter`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `referrals` (
	`invitee` text PRIMARY KEY NOT NULL,
	`inviter` text NOT NULL,
	`joined` integer NOT NULL,
	`qualified` integer DEFAULT 0 NOT NULL,
	`welcome_seen` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`invitee`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`inviter`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `referral_inviter` ON `referrals` (`inviter`,`qualified`);