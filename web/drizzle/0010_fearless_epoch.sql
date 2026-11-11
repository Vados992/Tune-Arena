DROP VIEW `overall_outcomes`;--> statement-breakpoint
DROP VIEW `round_outcomes`;--> statement-breakpoint
CREATE VIEW `overall_outcomes` AS SELECT r.id AS round_id, (
 SELECT e.id FROM entries e WHERE e.round_id=r.id AND e.hidden=0 AND e.withdrawn=0 AND (r.kind='test' OR e.media NOT LIKE 'sample:%') AND (
 (SELECT count(*) FROM votes v WHERE v.entry_id=e.id AND v.value=1 AND v.created>=r.opens AND v.created<r.closes)
 +5*(SELECT count(*) FROM motors m WHERE m.entry_id=e.id AND m.created>=r.opens AND m.created<r.closes))>0
 ORDER BY ((SELECT count(*) FROM votes v WHERE v.entry_id=e.id AND v.value=1 AND v.created>=r.opens AND v.created<r.closes)
 +5*(SELECT count(*) FROM motors m WHERE m.entry_id=e.id AND m.created>=r.opens AND m.created<r.closes)) DESC,e.created,e.rowid LIMIT 1
) AS winner_id FROM rounds r WHERE r.closes<=unixepoch();--> statement-breakpoint
CREATE VIEW `round_outcomes` AS 
  SELECT r.id AS round_id, (
    SELECT e.id FROM entries e JOIN votes v ON v.entry_id=e.id
    WHERE e.round_id=r.id AND e.hidden=0 AND e.withdrawn=0 AND (r.kind='test' OR e.media NOT LIKE 'sample:%') AND v.value=1 AND v.created>=r.opens AND v.created<r.closes
    GROUP BY e.id ORDER BY count(*) DESC,e.created ASC,e.rowid ASC LIMIT 1
  ) AS winner_id FROM rounds r WHERE r.closes<=unixepoch()
;