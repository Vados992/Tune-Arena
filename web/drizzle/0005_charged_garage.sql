CREATE TABLE motors (
 round_id text NOT NULL REFERENCES rounds(id),
 voter text NOT NULL REFERENCES profiles(id),
 entry_id text NOT NULL REFERENCES entries(id),
 created integer NOT NULL,
 PRIMARY KEY(round_id,voter)
);
--> statement-breakpoint
CREATE INDEX motor_entry ON motors(entry_id);
--> statement-breakpoint
CREATE TABLE charged_rounds (round_id text PRIMARY KEY REFERENCES rounds(id));
--> statement-breakpoint
INSERT INTO charged_rounds SELECT id FROM rounds WHERE closes>unixepoch();
--> statement-breakpoint
CREATE TRIGGER charged_new_round AFTER INSERT ON rounds BEGIN
 INSERT INTO charged_rounds VALUES(NEW.id);
END;
--> statement-breakpoint
CREATE VIEW overall_outcomes AS SELECT r.id AS round_id, (
 SELECT e.id FROM entries e WHERE e.round_id=r.id AND e.hidden=0 AND (
 (SELECT count(*) FROM votes v WHERE v.entry_id=e.id AND v.value=1 AND v.created>=r.opens AND v.created<r.closes)
 +5*(SELECT count(*) FROM motors m WHERE m.entry_id=e.id AND m.created>=r.opens AND m.created<r.closes))>0
 ORDER BY ((SELECT count(*) FROM votes v WHERE v.entry_id=e.id AND v.value=1 AND v.created>=r.opens AND v.created<r.closes)
 +5*(SELECT count(*) FROM motors m WHERE m.entry_id=e.id AND m.created>=r.opens AND m.created<r.closes)) DESC,e.created,e.rowid LIMIT 1
) AS winner_id FROM rounds r WHERE r.closes<=unixepoch();
--> statement-breakpoint
CREATE TABLE round_awards (
 round_id text PRIMARY KEY REFERENCES rounds(id),
 popular_entry text REFERENCES entries(id),
 overall_entry text REFERENCES entries(id),
 created integer NOT NULL
);
--> statement-breakpoint
CREATE TRIGGER credit_popular_award AFTER INSERT ON round_awards
 WHEN NEW.popular_entry IS NOT NULL AND EXISTS(SELECT 1 FROM rounds WHERE id=NEW.round_id AND kind='weekly')
 BEGIN
 INSERT OR IGNORE INTO profiles(id) SELECT owner FROM entries WHERE id=NEW.popular_entry;
 UPDATE profiles SET premium_until=
 CAST(strftime('%s',datetime(max(premium_until,unixepoch()),'unixepoch','start of month','+1 month')) AS integer)
 +(min(CAST(strftime('%d',max(premium_until,unixepoch()),'unixepoch') AS integer),
 CAST(strftime('%d',max(premium_until,unixepoch()),'unixepoch','start of month','+2 months','-1 day') AS integer))-1)*86400
 +((max(premium_until,unixepoch())%86400+86400)%86400),
 frame=CASE WHEN frame='plain' THEN 'neon' ELSE frame END
 WHERE id=(SELECT owner FROM entries WHERE id=NEW.popular_entry);
 END;
