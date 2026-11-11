import {config,db,cookie,cookieHeader,digest,failure,json} from './worker';

// Storage cleanup is durable: inaccessible objects are retried after transient R2 errors.
export async function cleanupDeletedMedia(){
 try{
  const {results}=await db().prepare('SELECT key FROM media_deletion_jobs LIMIT 10').all<{key:string}>();
  await Promise.all(results.map(async({key})=>{
   try{await config.BUCKET.delete(key);await db().prepare('DELETE FROM media_deletion_jobs WHERE key=?').bind(key).run();}catch{/* Keep the job for the next request. */}
  }));
 }catch{/* Cleanup must not break unrelated requests. */}
}

export async function deleteAccount(req:Request,user:string){
 const body=await req.json().catch(()=>null) as {confirmation?:unknown;userId?:unknown}|null;
 if(body?.confirmation!=='DELETE'||body.userId!==undefined)return failure('invalid_entry');
 const anonymous='deleted:'+crypto.randomUUID();
 const p=(sql:string,...values:(string|number)[])=>db().prepare(sql).bind(...values);
 await db().batch([
  p('INSERT OR IGNORE INTO deleted_accounts(user_id,created) VALUES(?,unixepoch())',user),
  p('INSERT INTO profiles(id) VALUES(?)',anonymous),
  p("INSERT OR IGNORE INTO media_deletion_jobs(key) SELECT media FROM entries WHERE owner=? AND media LIKE 'entries/%'",user),
  p("INSERT OR IGNORE INTO media_deletion_jobs(key) SELECT 'avatars/'||id FROM avatars WHERE owner=?",user),
  p('DELETE FROM avatars WHERE owner=?',user),
  p('DELETE FROM comments WHERE author=? OR entry_id IN(SELECT id FROM entries WHERE owner=?)',user,user),
  // Keep anonymous counts so deleting an account cannot rewrite a finished podium.
  p('UPDATE votes SET voter=? WHERE voter=?',anonymous,user),
  p('UPDATE motors SET voter=? WHERE voter=?',anonymous,user),
  p('UPDATE vote_events SET actor=? WHERE actor=?',anonymous,user),
  p("UPDATE entries SET owner=?,name='Удалённый участник',description='',media='',moderation_reason='',hidden=CASE WHEN EXISTS(SELECT 1 FROM rounds r WHERE r.id=entries.round_id AND r.closes>unixepoch()) THEN 1 ELSE hidden END,withdrawn=CASE WHEN EXISTS(SELECT 1 FROM rounds r WHERE r.id=entries.round_id AND r.closes>unixepoch()) THEN 1 ELSE withdrawn END WHERE owner=?",anonymous,user),
  p("UPDATE trophies SET owner=?,wallet='',reason='' WHERE owner=?",anonymous,user),
  p('DELETE FROM order_shipping WHERE order_id IN(SELECT id FROM commerce_orders WHERE owner=?)',user),
  p("UPDATE commerce_orders SET owner=?,request_key=id,external_reference='',tracking='',refund_reason='',state=CASE WHEN state='pending' THEN 'cancelled' ELSE state END WHERE owner=?",anonymous,user),
  p('UPDATE commerce_entitlements SET owner=?,revoked=1 WHERE owner=?',anonymous,user),
  p("UPDATE commerce_audit SET actor=CASE WHEN actor=? THEN ? ELSE actor END,reference='' WHERE actor=? OR target IN(SELECT id FROM commerce_orders WHERE owner=?)",user,anonymous,user,anonymous),
  p('DELETE FROM partner_leads WHERE owner=?',user),
  p('DELETE FROM referrals WHERE invitee=? OR inviter=?',user,user),
  p('DELETE FROM referral_rewards WHERE inviter=?',user),
  p('DELETE FROM referral_codes WHERE user_id=?',user),
  p('DELETE FROM round_organizers WHERE user_id=?',user),
  p('DELETE FROM organizers WHERE user_id=?',user),
  p('UPDATE organizers SET granted_by=? WHERE granted_by=?',anonymous,user),
  p('UPDATE round_organizers SET granted_by=? WHERE granted_by=?',anonymous,user),
  p('UPDATE staff_events SET actor=CASE WHEN actor=? THEN ? ELSE actor END,subject=CASE WHEN subject=? THEN ? ELSE subject END WHERE actor=? OR subject=?',user,anonymous,user,anonymous,user,user),
  p('UPDATE admin_events SET actor=CASE WHEN actor=? THEN ? ELSE actor END,target=CASE WHEN target=? THEN ? ELSE target END WHERE actor=? OR target=?',user,anonymous,user,anonymous,user,user),
  p("UPDATE rounds SET owner=?,title=CASE WHEN kind='test' THEN 'Удалённый тестовый тур' ELSE title END,notice=CASE WHEN kind='test' THEN '' ELSE notice END WHERE owner=?",anonymous,user),
  p('DELETE FROM auth_challenges WHERE browser=?',await digest(cookie(req,'ta_auth'))),
  p('DELETE FROM sessions WHERE user_id=?',user),
  p('DELETE FROM identities WHERE user_id=?',user),
  p('DELETE FROM profiles WHERE id=?',user),
 ]);
 const response=json({ok:true});
 for(const name of ['ta_session','ta_auth','ta_ref'])response.headers.append('Set-Cookie',cookieHeader(name,'',0));
 return response;
}
