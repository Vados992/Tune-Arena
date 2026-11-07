ALTER TABLE `votes` ADD `value` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
DROP VIEW `round_outcomes`;--> statement-breakpoint
CREATE VIEW `round_outcomes` AS
  SELECT r.id AS round_id, (
    SELECT e.id FROM entries e JOIN votes v ON v.entry_id=e.id
    WHERE e.round_id=r.id AND e.hidden=0 AND v.value=1 AND v.created>=r.opens AND v.created<r.closes
    GROUP BY e.id ORDER BY count(*) DESC,e.created ASC,e.rowid ASC LIMIT 1
  ) AS winner_id FROM rounds r WHERE r.closes<=unixepoch()
;
--> statement-breakpoint
DROP VIEW `round_outcomes`;
--> statement-breakpoint
CREATE VIEW `round_outcomes` AS
  SELECT r.id AS round_id, (
    SELECT e.id FROM entries e JOIN votes v ON v.entry_id=e.id
    WHERE e.round_id=r.id AND e.hidden=0 AND v.value=1 AND v.created>=r.opens AND v.created<r.closes
    GROUP BY e.id ORDER BY count(*) DESC,e.created ASC,e.rowid ASC LIMIT 1
  ) AS winner_id FROM rounds r WHERE r.closes<=unixepoch();
