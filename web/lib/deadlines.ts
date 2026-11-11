import {db} from './worker';
import {defaultSubmissionDeadline} from './submission-deadline.mjs';
export async function ensureSubmissionDeadline(id:string){
 const r=await db().prepare('SELECT opens,closes,kind,submission_closes FROM rounds WHERE id=?').bind(id)
 .first<{opens:number;closes:number;kind:string;submission_closes:number|null}>();
 if(r&&r.submission_closes===null)await db().prepare('UPDATE rounds SET submission_closes=? WHERE id=? AND submission_closes IS NULL')
 .bind(defaultSubmissionDeadline(r.opens,r.closes,r.kind),id).run();
}
