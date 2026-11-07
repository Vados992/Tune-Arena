CREATE TABLE `vote_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`round_id` text NOT NULL,
	`entry_id` text NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`created` integer NOT NULL,
	FOREIGN KEY (`round_id`) REFERENCES `rounds`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `vote_event_round_time` ON `vote_events` (`round_id`,`created`);--> statement-breakpoint
CREATE INDEX `vote_event_time` ON `vote_events` (`created`);--> statement-breakpoint
CREATE INDEX `round_closes` ON `rounds` (`closes`);--> statement-breakpoint
CREATE VIEW `round_outcomes` AS
  SELECT r.id AS round_id, (
    SELECT e.id FROM entries e JOIN votes v ON v.entry_id=e.id
    WHERE e.round_id=r.id AND e.hidden=0 AND v.created>=r.opens AND v.created<r.closes
    GROUP BY e.id ORDER BY count(*) DESC,e.created ASC,e.rowid ASC LIMIT 1
  ) AS winner_id FROM rounds r WHERE r.closes<=unixepoch()
;