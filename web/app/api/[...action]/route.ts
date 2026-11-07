import { config, db, currentUser, json, failure, origin, isAdministrator, cookieHeader } from "@/lib/worker";
import { acknowledgeClub, ensureParticipant, getClub, refreshReferrals, referralCode, referralCookie } from "@/lib/referrals";
import { authRoute, loginOptions } from "@/lib/auth";
import { leaderboard, insertVote, removeVote, insertDislike, removeDislike, insertEntry, voteAudit } from "@/lib/round-sql";
import { adminRoute, createRound, getProfile, profileRoute, validId } from "@/lib/catalog";
import { garagePhoto } from "@/lib/garage";
import { winnersRoute } from "@/lib/results";

export const dynamic = "force-dynamic";
type Round = {id:string; owner:string; kind:string; opens:number; closes:number; server_time:number; title:string;notice:string;prize:string;announced:number;winner_id?:string|null};
type Entry = {id:string; owner:string; name:string; description:string; media:string; likes:number; liked:number; dislikes:number;disliked:number;frame:string; gift:number; created:number;nickname:string|null};

async function getRound(id: string, user: string) {
  return db().prepare("SELECT *,unixepoch() AS server_time FROM rounds WHERE id=? AND (owner=? OR kind='weekly')").bind(id,user).first<Round>();
}

async function state(req: Request, user: string | null) {
  const target=new URL(req.url).searchParams.get("round");
  let id=target && validId.test(target) ? target : null;
  if (user) await refreshReferrals(user);
  const profile=await getProfile(user);
  const club=user?await getClub(req,user):null;
  const base={signedIn:!!user,providers:loginOptions(),profile,club,admin:!!user&&await isAdministrator(req)};
  if (!id && user) {
    const last=await db().prepare(`SELECT id FROM rounds WHERE owner=? OR kind='weekly'
      ORDER BY (owner=?) DESC,opens DESC,rowid DESC LIMIT 1`).bind(user,user).first<{id:string}>();
    id=last?.id??null;
  }
  if (!id) return json({...base,setup:!!user});
  const batch=await db().batch([
    db().prepare(`SELECT r.*,unixepoch() AS server_time,o.winner_id FROM rounds r LEFT JOIN round_outcomes o ON o.round_id=r.id
      WHERE r.id=? AND (r.owner=? OR r.kind='weekly')`).bind(id,user??""),
    db().prepare(leaderboard).bind(user??"",user??"",id,user??""),
  ]);
  const r=batch[0].results[0] as Round|undefined;
  if (!r) return failure("not_found",404);
  const entries=(batch[1].results as Entry[]).map(({owner,media,...e})=>{
    const photo=garagePhoto(media);
    return {...e,name:photo?.title??e.name,mine:owner===user,sample:!!photo,liked:!!e.liked,disliked:!!e.disliked,image:photo?.image??"/api/media/"+e.id,
      credit:photo ? {author:photo.author,source:photo.source,license:photo.license,terms:photo.terms}:undefined};
  });
  const closed=r.server_time>=r.closes;
  const winner=r.winner_id ? entries.find(entry=>entry.id===r.winner_id) : undefined;
  return json({
    ...base,round:{id:r.id,kind:r.kind,opens:r.opens,closes:r.closes,closed,serverTime:r.server_time,title:r.title,
      notice:r.notice,prize:r.prize,announced:r.announced},
    winner:winner ? {id:winner.id,name:winner.name,likes:winner.likes,nickname:winner.nickname}:null,
    entries,
  });
}

const imageType = (b: Uint8Array) => {
  const at=(n:number)=>String.fromCharCode(...b.slice(n,n+4));
  if (b.length>32 && b[0]===255 && b[1]===216 && b[2]===255) return "image/jpeg";
  if (b.length>32 && b[0]===137 && at(1)==="PNG\r" && b[5]===10 && b[6]===26 && b[7]===10) return "image/png";
  if (b.length>32 && at(0)==="RIFF" && at(8)==="WEBP") return "image/webp";
  return null;
};
const maxUpload = 4*1024*1024;
async function boundedForm(req: Request) {
  const reader=req.body?.getReader();
  if (!reader) return null;
  const parts:Uint8Array<ArrayBuffer>[]=[];
  let total=0;
  try {
    for (;;) {
      const item=await reader.read();
      if (item.done) break;
      total+=item.value.byteLength;
      if (total>maxUpload+16000) {await reader.cancel();return null;}
      parts.push(Uint8Array.from(item.value));
    }
  } finally {reader.releaseLock();}
  return new Response(new Blob(parts),{headers:{"Content-Type":req.headers.get("content-type")??""}}).formData().catch(()=>null);
}

async function upload(req: Request, user: string, id: string) {
  if (!(await getProfile(user)).nickname) return failure("nickname_required",409);
  const r=await getRound(id,user);
  if (!r) return failure("not_found",404);
  if (r.server_time>=r.closes) return failure("closed",409);
  if (Number(req.headers.get("content-length")||0)>maxUpload+16000) return failure("invalid_image",413);
  const form=await boundedForm(req);
  if (!form) return failure("invalid_entry");
  const name=String(form.get("name")??"").trim(), description=String(form.get("description")??"").trim();
  const photo=form.get("photo");
  if (!name || name.length>55 || !description || description.length>160 || form.get("rights")!=="yes") return failure("invalid_entry");
  if (!(photo instanceof File) || photo.size>maxUpload) return failure("invalid_image");
  const bytes=new Uint8Array(await photo.arrayBuffer()), type=imageType(bytes);
  if (!type) return failure("invalid_image");
  const entry=crypto.randomUUID();
  const key="entries/"+entry;
  await config.BUCKET.put(key,bytes,{httpMetadata:{contentType:type}});
  let result;
  try {
    result=await db().prepare(insertEntry).bind(entry,user,name,description,key,id,user,user).run();
  } catch (e) {
    await config.BUCKET.delete(key).catch(()=>{});
    throw e;
  }
  if (!result.meta.changes) {
    await config.BUCKET.delete(key).catch(()=>{});
    const latest=await getRound(id,user);
    return failure(latest && latest.server_time<latest.closes ? "entry_exists" : "closed",409);
  }
  await refreshReferrals(user);
  return json({id:entry},201);
}

async function media(req:Request,id: string, user: string|null) {
  const row=await db().prepare(`SELECT e.media FROM entries e JOIN rounds r ON r.id=e.round_id
    WHERE e.id=? AND ((e.hidden=0 AND (r.owner=? OR r.kind='weekly')) OR ?=1)`).bind(id,user??"",Number(await isAdministrator(req))).first<{media:string}>();
  if (!row?.media.startsWith("entries/")) return failure("not_found",404);
  const object=await config.BUCKET.get(row.media);
  if (!object) return failure("not_found",404);
  return new Response(object.body,{headers:{"Content-Type":object.httpMetadata?.contentType??"application/octet-stream","X-Content-Type-Options":"nosniff","Cache-Control":"no-store","Content-Security-Policy":"default-src 'none'"}});
}

async function handle(req: Request) {
  const url=new URL(req.url), path=url.pathname.split("/").filter(Boolean).slice(1).join("/");
  const method=req.method;
  if (method!=="GET" && req.headers.get("origin")!==origin(req)) return failure("forbidden",403);
  if (path.startsWith("auth/")) return authRoute(req,path);
  const user=await currentUser(req);
  if (user) await ensureParticipant(user,referralCode(req));
  if (method==="GET" && path==="state") return state(req,user);
  if (method==="GET" && path==="winners") return winnersRoute(req,user);
  const [resource,id,action,entryId]=path.split("/");
  if (method==="GET" && resource==="media" && validId.test(id??"")) return media(req,id,user);
  if (resource==="entries" && action==="comments" && validId.test(id??"")) return failure("not_found",404);
  if (!user) return failure("sign_in",401);
  if (path==="referrals/ack" && method==="POST") return acknowledgeClub(req,user);
  if (resource==="admin") return adminRoute(req,user,path.split("/").slice(1));
  if (resource==="profile" && method==="PUT") return profileRoute(req,user,path);
  if (path==="rounds" && method==="POST") {
    const body=await req.json().catch(()=>null) as Record<string,unknown> | null;
    if (body?.kind!=="weekly" && body?.kind!=="test") return failure("invalid_entry");
    if (body.kind==="weekly" && !await isAdministrator(req)) return failure("forbidden",403);
    const quota=await db().prepare("SELECT count(*) AS n FROM rounds WHERE owner=? AND opens>unixepoch()-3600").bind(user).first<{n:number}>();
    if ((quota?.n??0)>=12) return failure("rate_limited",429);
    return json({id:await createRound(user,body.kind)},201);
  }
  if (path==="premium" && method==="POST") {
    await db().prepare(`INSERT INTO profiles(id,premium_until,frame,gift) VALUES(?,unixepoch()+259200,'neon',0)
      ON CONFLICT(id) DO UPDATE SET premium_until=excluded.premium_until,frame='neon'
      WHERE profiles.premium_until=0`).bind(user).run();
    return json({ok:true});
  }
  if (path==="gift" && method==="POST") {
    const result=await db().prepare("UPDATE profiles SET gift=1,frame='flame' WHERE id=? AND premium_until>unixepoch()").bind(user).run();
    return result.meta.changes?json({ok:true}):failure("premium_required",403);
  }
  if (resource!=="rounds" || !validId.test(id??"")) return failure("not_found",404);
  if (action==="entries" && method==="POST") return upload(req,user,id);
  if ((action==="votes"||action==="dislikes") && validId.test(entryId??"") && ["PUT","DELETE"].includes(method)) {
    const adding=method==="PUT";
    const negative=action==="dislikes";
    const change=adding?db().prepare(negative?insertDislike:insertVote).bind(user,entryId,id,user,user)
      :db().prepare(negative?removeDislike:removeVote).bind(entryId,user,id,user);
    const event=(negative?"dislike":"vote")+(adding?"_added":"_removed");
    const [result]=await db().batch([change,db().prepare(voteAudit).bind(id,entryId,user,event)]);
    if (result.meta.changes) {await refreshReferrals(user);return json({ok:true});}
    const row=await db().prepare(`SELECT e.owner AS author,r.closes,r.opens,unixepoch() AS clock FROM entries e JOIN rounds r ON r.id=e.round_id
      WHERE e.id=? AND r.id=? AND e.hidden=0 AND (r.owner=? OR r.kind='weekly')`).bind(entryId,id,user).first<{author:string;closes:number;opens:number;clock:number}>();
    if (!row) return failure("not_found",404);
    if (row.clock>=row.closes || row.clock<row.opens) return failure("closed",409);
    if (row.author===user) return failure("own_entry",403);
    return json({ok:true});
  }
  return failure("not_found",404);
}
async function safe(req: Request) {
  try {
    const response=await handle(req);
    const code=new URL(req.url).searchParams.get("ref");
    if (code && referralCode(req)===code) response.headers.append("Set-Cookie",cookieHeader(referralCookie,code,30*86400));
    return response;
  }
  catch (error) { console.error("Tune Arena handler failure",error instanceof Error ? error.name:"unknown"); return failure("server_error",500); }
}
export const GET=safe, POST=safe, PUT=safe, DELETE=safe;
