// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
const encoder=new TextEncoder();
export async function validateTelegramInitData(raw,botToken,clock=Math.floor(Date.now()/1000),maxAge=300) {
 if(typeof raw!=='string'||raw.length>16384||!raw||!botToken)return null;
 const params=new URLSearchParams(raw),seen=new Set();
 for(const [key,value] of params){
  if(seen.has(key)||!key||/[\r\n=]/.test(key)||/[\r\n]/.test(value))return null;
  seen.add(key);
 }
 const hash=params.get('hash');
 if(!/^[a-f0-9]{64}$/i.test(hash??''))return null;
 const timestamp=params.get('auth_date');
 if(!/^[0-9]{1,12}$/.test(timestamp??''))return null;
 const issued=Number(timestamp);
 if(issued>clock+30||clock-issued>maxAge)return null;
 params.delete('hash');
 const data=[...params].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>k+'='+v).join('\n');
 const hmac=async(key,message)=>{
  const k=await crypto.subtle.importKey('raw',key,{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return crypto.subtle.sign('HMAC',k,encoder.encode(message));
 };
 const secret=await hmac(encoder.encode('WebAppData'),botToken);
 const key=await crypto.subtle.importKey('raw',secret,{name:'HMAC',hash:'SHA-256'},false,['verify']);
 const signature=Uint8Array.from(hash.match(/../g),v=>parseInt(v,16));
 if(!await crypto.subtle.verify('HMAC',key,signature,encoder.encode(data)))return null;
 try{
  const user=JSON.parse(params.get('user')??'null');
  if(!user||!Number.isSafeInteger(user.id)||user.id<=0||user.is_bot)return null;
  return {id:String(user.id),issued,hash:hash.toLowerCase()};
 }catch{return null;}
}

// Fail closed on a malformed allowlist; no public usernames or client roles.
export function administratorTelegramIds(list,single){
 const values=[...(list??'').split(','),single??''].map(v=>v.trim()).filter(Boolean);
 return values.length<=20&&values.every(v=>/^[1-9][0-9]{0,15}$/.test(v)&&Number.isSafeInteger(Number(v)))?[...new Set(values)]:[];
}
