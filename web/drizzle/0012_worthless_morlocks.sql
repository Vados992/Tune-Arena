DROP VIEW `overall_outcomes`;--> statement-breakpoint
CREATE VIEW `overall_outcomes` AS 
WITH scored AS (
 SELECT e.id,e.round_id,e.created,e.rowid AS ordinal,
 (SELECT count(*) FROM votes v WHERE v.entry_id=e.id AND v.value=1 AND v.created>=r.opens AND v.created<r.closes)
 +5*(SELECT count(*) FROM motors m WHERE m.entry_id=e.id AND m.created>=r.opens AND m.created<r.closes) AS score
 FROM entries e JOIN rounds r ON r.id=e.round_id
 WHERE e.hidden=0 AND e.withdrawn=0 AND (r.kind='test' OR e.media NOT LIKE 'sample:%')
), ranked AS (
 SELECT round_id,id,row_number() OVER(PARTITION BY round_id ORDER BY score DESC,created ASC,ordinal ASC) AS position
 FROM scored WHERE score>0
)
SELECT r.id AS round_id,w.id AS winner_id FROM rounds r
LEFT JOIN ranked w ON w.round_id=r.id AND w.position=1
WHERE r.closes<=unixepoch();