export const insertVote = `
  INSERT INTO votes(entry_id,voter,created,value)
  SELECT e.id, ?, unixepoch(),1 FROM entries e JOIN rounds r ON r.id=e.round_id
  WHERE e.id=? AND r.id=? AND (r.owner=? OR r.kind='weekly') AND e.hidden=0 AND e.withdrawn=0 AND e.owner<>?
    AND (r.kind='test' OR e.media NOT LIKE 'sample:%')
    AND unixepoch()>=r.opens AND unixepoch()<r.closes
  ON CONFLICT(entry_id,voter) DO UPDATE SET value=1,created=excluded.created WHERE votes.value<>1`;

export const insertDislike = `
  INSERT INTO votes(entry_id,voter,created,value)
  SELECT e.id, ?, unixepoch(),-1 FROM entries e JOIN rounds r ON r.id=e.round_id
  WHERE e.id=? AND r.id=? AND (r.owner=? OR r.kind='weekly') AND e.hidden=0 AND e.withdrawn=0 AND e.owner<>?
    AND unixepoch()>=r.opens AND unixepoch()<r.closes
  ON CONFLICT(entry_id,voter) DO UPDATE SET value=-1,created=excluded.created WHERE votes.value<>-1`;

export const removeVote = `
  DELETE FROM votes WHERE entry_id=? AND voter=? AND value=1 AND EXISTS(
    SELECT 1 FROM entries e JOIN rounds r ON r.id=e.round_id
    WHERE e.id=votes.entry_id AND r.id=? AND (r.owner=? OR r.kind='weekly') AND e.hidden=0 AND e.withdrawn=0
      AND unixepoch()>=r.opens AND unixepoch()<r.closes)`;

export const removeDislike = `
  DELETE FROM votes WHERE entry_id=? AND voter=? AND value=-1 AND EXISTS(
    SELECT 1 FROM entries e JOIN rounds r ON r.id=e.round_id
    WHERE e.id=votes.entry_id AND r.id=? AND (r.owner=? OR r.kind='weekly') AND e.hidden=0 AND e.withdrawn=0
      AND unixepoch()>=r.opens AND unixepoch()<r.closes)`;

export const insertEntry = `
  INSERT INTO entries(id,round_id,owner,name,description,media,created)
  SELECT ?,r.id,?,?,?,?,unixepoch() FROM rounds r
  WHERE r.id=? AND (r.owner=? OR r.kind='weekly') AND unixepoch()>=r.opens AND unixepoch()<coalesce(r.submission_closes,r.closes)
    AND NOT EXISTS (SELECT 1 FROM entries e WHERE e.round_id=r.id AND e.owner=?)`;

export const leaderboard = `
  SELECT e.id,e.name,e.description,e.media,e.created,e.owner,
         SUM(CASE WHEN v.value=1 THEN 1 ELSE 0 END) AS likes,
         MAX(CASE WHEN v.voter=? AND v.value=1 THEN 1 ELSE 0 END) AS liked,
         CASE WHEN p.premium_until>unixepoch() THEN p.frame ELSE 'plain' END AS frame,
         CASE WHEN p.premium_until>unixepoch() THEN p.gift ELSE 0 END AS gift,
         p.nickname,(SELECT '/api/avatars/'||a.id FROM avatars a WHERE a.owner=e.owner) AS avatar,
         SUM(CASE WHEN v.value=-1 THEN 1 ELSE 0 END) AS dislikes,
         MAX(CASE WHEN v.voter=? AND v.value=-1 THEN 1 ELSE 0 END) AS disliked,
         p.premium_until>unixepoch() AS premium,
         (SELECT count(*) FROM motors m WHERE m.entry_id=e.id AND m.created>=r.opens AND m.created<r.closes) AS motors,
         (SELECT count(*) FROM votes w WHERE w.entry_id=e.id AND w.value=1 AND w.created>=r.opens AND w.created<r.closes)+5*(SELECT count(*) FROM motors m WHERE m.entry_id=e.id AND m.created>=r.opens AND m.created<r.closes) AS score, e.rowid AS entryOrder
  FROM entries e JOIN rounds r ON r.id=e.round_id
  LEFT JOIN votes v ON v.entry_id=e.id AND v.created>=r.opens AND v.created<r.closes
  LEFT JOIN profiles p ON p.id=e.owner
  WHERE r.id=? AND (r.owner=? OR r.kind='weekly') AND e.hidden=0 AND e.withdrawn=0
    AND (r.kind='test' OR e.media NOT LIKE 'sample:%')
  GROUP BY e.id
  ORDER BY likes DESC,e.created ASC,e.rowid ASC`;

export const voteAudit = `
  INSERT INTO vote_events(round_id,entry_id,actor,action,created)
  SELECT ?,?,?,?,unixepoch() WHERE changes()>0`;
