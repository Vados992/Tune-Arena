import {config,db,currentUser,token,digest,now,cookie,cookieHeader,json,failure} from './worker';
import {validateTelegramInitData} from './telegram-init-data.mjs';
export async function miniAppSignIn(req:Request){
 if(!config.TELEGRAM_BOT_TOKEN)return failure('provider_unavailable',503);
 // Bound the request before JSON parsing. initData is a credential, never log it.
 const reader=req.body?.getReader();if(!reader)return failure('invalid_data');
 let size=0;const chunks:Uint8Array[]=[];
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>20000){await reader.cancel();return failure('invalid_data',413);}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
 let raw:unknown;try{raw=JSON.parse(new TextDecoder().decode(bytes)).initData;}catch{return failure('invalid_data');}
 if(typeof raw!=='string')return failure('invalid_data');
 const verified=await validateTelegramInitData(raw,config.TELEGRAM_BOT_TOKEN,now(),Infinity);
 if(!verified)return failure('expired',401);
 const subject=await digest('telegram:'+verified.id);
 const identity=await db().prepare("SELECT user_id FROM identities WHERE provider='telegram' AND subject=?").bind(subject).first<{user_id:string}>();
 const current=await currentUser(req);
 if(identity&&identity.user_id===current)return json({ok:true,changed:false});
 if(now()-verified.issued>300)return failure('expired',401);
 const marker='mini:'+verified.hash;
 const user=crypto.randomUUID(),session=token(),sessionId=await digest(session),ttl=14*86400;
 try{
  // One transaction consumes the signed launch and creates a session for its
  // verified identity. Never attach it to an unrelated existing browser account.
  await db().batch([
   db().prepare("DELETE FROM auth_challenges WHERE kind='telegram-mini' AND expires<unixepoch()-3600"),
   db().prepare("INSERT INTO auth_challenges(id,kind,subject,browser,quota,secret,created,expires) VALUES(?,'telegram-mini','','','','',unixepoch(),?)").bind(marker,verified.issued+300),
   db().prepare("INSERT OR IGNORE INTO identities(provider,subject,user_id) VALUES('telegram',?,?)").bind(subject,user),
   db().prepare("INSERT INTO sessions(id,user_id,expires) SELECT ?,user_id,? FROM identities WHERE provider='telegram' AND subject=?").bind(sessionId,now()+ttl,subject),
   db().prepare('DELETE FROM sessions WHERE id=?').bind(await digest(cookie(req,'ta_session'))),
  ]);
 }catch(error){
  if(await db().prepare('SELECT id FROM auth_challenges WHERE id=?').bind(marker).first())return failure('expired',401);
  throw error;
 }
 const response=json({ok:true,changed:true});
 response.headers.append('Set-Cookie',cookieHeader('ta_session',session,ttl));
 response.headers.append('Set-Cookie',cookieHeader('ta_auth','',0));
 return response;
}
