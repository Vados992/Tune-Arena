import {db,json,failure} from './worker';
import {canManageRound} from './access';
import {audit} from './commerce';
export async function spotlight(round?:string){return (await db().prepare(`SELECT e.id,e.name,e.media,p.nickname,c.kind,c.ends FROM commerce_entitlements c JOIN entries e ON e.id=c.entry_id JOIN rounds r ON r.id=e.round_id LEFT JOIN profiles p ON p.id=e.owner
 WHERE c.kind IN ('pin','slot') AND c.revoked=0 AND c.ends>unixepoch() AND e.hidden=0 AND e.withdrawn=0 AND r.kind='weekly'${round?' AND r.id=?':''} ORDER BY c.starts DESC LIMIT 12`).bind(...(round?[round]:[])).all()).results;}
export async function moderation(req:Request,user:string,entry:string){
 const row=await db().prepare('SELECT round_id FROM entries WHERE id=?').bind(entry).first<{round_id:string}>();
 if(!row||!await canManageRound(user,row.round_id))return failure('forbidden',403);
 const p=await req.json().catch(()=>null) as any;if(!p||!['approved','rejected'].includes(p.decision)||typeof p.reason!=='string'||p.reason.length>500||p.decision==='rejected'&&!p.reason.trim())return failure('invalid_moderation');
 const result=await db().batch([db().prepare(`UPDATE entries SET moderation_state=?,moderation_reason=?,hidden=? WHERE id=? AND withdrawn=0 AND EXISTS(SELECT 1 FROM rounds r WHERE r.id=entries.round_id AND r.closes>unixepoch())`).bind(p.decision,p.reason.trim(),p.decision==='rejected'?1:0,entry),audit(user,'moderation_'+p.decision,entry,p.reason.trim())]);
 return result[0].meta.changes?json({ok:true}):failure('closed',409);
}
export const retryOld=`UPDATE entries SET withdrawn=1,superseded_by=? WHERE id=? AND round_id=? AND owner=? AND moderation_state='rejected' AND superseded_by IS NULL
 AND EXISTS(SELECT 1 FROM commerce_entitlements c JOIN rounds r ON r.id=entries.round_id WHERE c.order_id=? AND c.owner=entries.owner AND c.entry_id=entries.id AND c.kind='retry' AND c.consumed=0 AND c.revoked=0 AND c.ends>unixepoch() AND unixepoch()>=r.opens AND unixepoch()<coalesce(r.submission_closes,r.closes))`;
