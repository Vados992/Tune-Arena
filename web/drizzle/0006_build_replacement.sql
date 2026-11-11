ALTER TABLE rounds ADD submission_closes integer;
--> statement-breakpoint
ALTER TABLE entries ADD withdrawn integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE entries ADD superseded_by text;
--> statement-breakpoint
CREATE INDEX entry_owner_round ON entries(round_id,owner,superseded_by);
--> statement-breakpoint
DROP VIEW round_outcomes;
--> statement-breakpoint
CREATE VIEW round_outcomes AS SELECT r.id AS round_id, (
    SELECT e.id FROM entries e JOIN votes v ON v.entry_id=e.id
    WHERE e.round_id=r.id AND e.hidden=0 AND e.withdrawn=0 AND v.value=1 AND v.created>=r.opens AND v.created<r.closes
    GROUP BY e.id ORDER BY count(*) DESC,e.created ASC,e.rowid ASC LIMIT 1
  ) AS winner_id FROM rounds r WHERE r.closes<=unixepoch();
--> statement-breakpoint
DROP VIEW overall_outcomes;
--> statement-breakpoint
CREATE VIEW overall_outcomes AS SELECT r.id AS round_id, (
 SELECT e.id FROM entries e WHERE e.round_id=r.id AND e.hidden=0 AND e.withdrawn=0 AND (
 (SELECT count(*) FROM votes v WHERE v.entry_id=e.id AND v.value=1 AND v.created>=r.opens AND v.created<r.closes)
 +5*(SELECT count(*) FROM motors m WHERE m.entry_id=e.id AND m.created>=r.opens AND m.created<r.closes))>0
 ORDER BY ((SELECT count(*) FROM votes v WHERE v.entry_id=e.id AND v.value=1 AND v.created>=r.opens AND v.created<r.closes)
 +5*(SELECT count(*) FROM motors m WHERE m.entry_id=e.id AND m.created>=r.opens AND m.created<r.closes)) DESC,e.created,e.rowid LIMIT 1
) AS winner_id FROM rounds r WHERE r.closes<=unixepoch();
