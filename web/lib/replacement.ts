import {db,failure,json} from './worker';
// Fresh IDs prevent a delayed vote for the old photo from reaching its replacement.
export const replaceOld=`UPDATE entries SET withdrawn=1,superseded_by=? WHERE id=? AND round_id=? AND owner=?
 AND hidden=0 AND superseded_by IS NULL AND EXISTS(SELECT 1 FROM profiles p JOIN rounds r ON r.id=entries.round_id
 WHERE p.id=? AND p.premium_until>unixepoch() AND (r.owner=? OR r.kind='weekly')
 AND unixepoch()>=r.opens AND unixepoch()<coalesce(r.submission_closes,r.closes) AND unixepoch()<r.closes)`;
export const replaceNew=`INSERT INTO entries(id,round_id,owner,name,description,media,created)
 SELECT ?,round_id,owner,?,?,?,unixepoch() FROM entries WHERE id=? AND superseded_by=?`;
export const resetOldVotes=`DELETE FROM votes WHERE entry_id=? AND EXISTS(SELECT 1 FROM entries e WHERE e.id=votes.entry_id AND e.superseded_by=?)`;
export const entryAudit=`INSERT INTO admin_events(id,round_id,actor,action,target,created)
 SELECT ?,?,?,?,?,unixepoch() WHERE changes()>0`;
export async function withdrawEntry(user:string,round:string,entry:string){
 const row=await db().prepare('SELECT id,withdrawn FROM entries WHERE id=? AND round_id=? AND owner=? AND hidden=0 AND superseded_by IS NULL').bind(entry,round,user).first<{id:string;withdrawn:number}>();
 if(!row)return failure('not_found',404);
 const [changed]=await db().batch([
 db().prepare(`UPDATE entries SET withdrawn=1 WHERE id=? AND round_id=? AND owner=? AND hidden=0 AND withdrawn=0 AND superseded_by IS NULL
 AND EXISTS(SELECT 1 FROM rounds r JOIN profiles p ON p.id=? WHERE r.id=entries.round_id AND (r.owner=? OR r.kind='weekly')
 AND p.premium_until>unixepoch() AND unixepoch()>=r.opens AND unixepoch()<coalesce(r.submission_closes,r.closes) AND unixepoch()<r.closes)`)
 .bind(entry,round,user,user,user),
 db().prepare(entryAudit).bind(crypto.randomUUID(),round,user,'entry_withdrawn',entry),
 db().prepare(`DELETE FROM votes WHERE entry_id=? AND EXISTS(SELECT 1 FROM entries e WHERE e.id=votes.entry_id AND e.withdrawn=1 AND e.owner=?)`).bind(entry,user),
 ]);
 if(changed.meta.changes)return json({ok:true});
 return entryMutationError(user,round,entry,row.withdrawn===1);
}
export async function entryMutationError(user:string,round:string,entry:string,idempotent=false){
 const r=await db().prepare(`SELECT r.opens,r.closes,coalesce(r.submission_closes,r.closes) AS deadline,unixepoch() AS clock,p.premium_until,e.superseded_by,e.hidden
 FROM entries e JOIN rounds r ON r.id=e.round_id JOIN profiles p ON p.id=e.owner
 WHERE e.id=? AND e.round_id=? AND e.owner=? AND (r.owner=? OR r.kind='weekly')`).bind(entry,round,user,user)
 .first<{opens:number;closes:number;deadline:number;clock:number;premium_until:number;superseded_by:string|null;hidden:number}>();
 if(!r||r.hidden)return failure('not_found',404);
 if(r.clock<r.opens||r.clock>=r.closes||r.clock>=r.deadline)return failure('submissions_closed',409);
 if(r.premium_until<=r.clock)return failure('premium_required',403);
 if(r.superseded_by)return failure('entry_replaced',409);
 return idempotent?json({ok:true}):failure('entry_replaced',409);
}
