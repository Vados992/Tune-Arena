import {db,failure,json} from './worker';
import {voteAudit} from './round-sql';
// INSERT OR IGNORE plus the primary key makes parallel requests and retries safe.
export const spendMotor=`INSERT OR IGNORE INTO motors(round_id,voter,entry_id,created)
 SELECT r.id,?,e.id,unixepoch() FROM entries e JOIN rounds r ON r.id=e.round_id
 JOIN profiles p ON p.id=? JOIN charged_rounds c ON c.round_id=r.id
 WHERE e.id=? AND r.id=? AND (r.owner=? OR r.kind='weekly') AND e.hidden=0 AND e.withdrawn=0 AND e.owner<>?
 AND (r.kind='test' OR e.media NOT LIKE 'sample:%')
 AND p.premium_until>unixepoch() AND unixepoch()>=r.opens AND unixepoch()<r.closes`;
export async function motorRoute(user:string,round:string,entry:string) {
 const [result]=await db().batch([db().prepare(spendMotor).bind(user,user,entry,round,user,user),
 db().prepare(voteAudit).bind(round,entry,user,'motor_added')]);
 if(result.meta.changes) return json({ok:true});
 const row=await db().prepare(`SELECT e.owner,r.opens,r.closes,unixepoch() AS clock,
 p.premium_until,(SELECT entry_id FROM motors WHERE round_id=r.id AND voter=?) AS spent
 FROM entries e JOIN rounds r ON r.id=e.round_id JOIN profiles p ON p.id=?
 JOIN charged_rounds c ON c.round_id=r.id
 WHERE r.id=? AND e.id=? AND e.hidden=0 AND e.withdrawn=0 AND (r.owner=? OR r.kind='weekly')
 AND (r.kind='test' OR e.media NOT LIKE 'sample:%')`)
 .bind(user,user,round,entry,user).first<{owner:string;opens:number;closes:number;clock:number;premium_until:number;spent:string|null}>();
 if(!row) return failure('not_found',404);
 if(row.clock<row.opens||row.clock>=row.closes) return failure('closed',409);
 if(row.owner===user) return failure('own_entry',403);
 if(row.spent===entry) return json({ok:true});
 if(row.premium_until<=row.clock) return failure('premium_required',403);
 return failure('motor_spent',409);
}
// Awards and the Premium credit trigger commit atomically. Tests never grant prizes.
export async function settleRoundAwards() {
 await db().prepare(`INSERT OR IGNORE INTO round_awards(round_id,popular_entry,overall_entry,created)
 SELECT c.round_id,p.winner_id,o.winner_id,unixepoch() FROM charged_rounds c
 JOIN round_outcomes p ON p.round_id=c.round_id JOIN overall_outcomes o ON o.round_id=c.round_id
 WHERE NOT EXISTS(SELECT 1 FROM round_awards a WHERE a.round_id=c.round_id)`).run();
}
