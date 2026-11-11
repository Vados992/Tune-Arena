import {deleteAccount,cleanupDeletedMedia} from "@/lib/account";
import {imageType,maxUpload,boundedForm} from "@/lib/upload-image";
import {avatarMedia,saveAvatar,removeAvatar} from "@/lib/avatar";
import { config, db, currentUser, json, failure, origin, isAdministrator, cookieHeader } from "@/lib/worker";
import { staffAccess } from "@/lib/access";
import { acknowledgeClub, ensureParticipant, getClub, refreshReferrals, referralCode, referralCookie } from "@/lib/referrals";
import { authRoute, loginOptions } from "@/lib/auth";
import { leaderboard, insertVote, removeVote, insertEntry, voteAudit } from "@/lib/round-sql";
import { adminRoute, createRound, getProfile, profileRoute, validId } from "@/lib/catalog";
import { garagePhoto } from "@/lib/garage";
import { publicTours,winnersRoute } from "@/lib/results";

import {motorRoute,settleRoundAwards} from "@/lib/charged";

import {ensureSubmissionDeadline} from "@/lib/deadlines";
import {replaceOld,replaceNew,resetOldVotes,entryAudit,entryMutationError,withdrawEntry} from "@/lib/replacement";

import {catalogRoute,createOrder,checkout,orderAction,paymentWebhook,commerceAdmin} from '@/lib/commerce';
import {sponsorPublic,sponsorEvent,partnerLead,sponsorsAdmin} from '@/lib/sponsorship';
import {trophyList,trophyPublic,trophyMetadata,trophyAction,issueTrophies} from '@/lib/trophies';
import {spotlight,moderation,retryOld} from '@/lib/promotions';

export const dynamic = "force-dynamic";
type Round = {id:string; owner:string; kind:string; opens:number; closes:number; submission_closes:number; server_time:number; title:string;notice:string;prize:string;announced:number;winner_id?:string|null};
type Entry = {id:string; owner:string; name:string; description:string; media:string; likes:number; liked:number; dislikes:number;disliked:number;frame:string; gift:number; created:number;nickname:string|null;premium:number;motors:number;score:number;entryOrder:number};

async function getRound(id: string, user: string) {
  await ensureSubmissionDeadline(id);
  return db().prepare("SELECT *,unixepoch() AS server_time FROM rounds WHERE id=? AND (owner=? OR kind='weekly')").bind(id,user).first<Round>();
}

async function state(req: Request, user: string | null) {
  const target=new URL(req.url).searchParams.get("round");
  let id=target && validId.test(target) ? target : null;
  if (user) await refreshReferrals(user);
  await settleRoundAwards();
  const profile=await getProfile(user);
  const club=user?await getClub(req,user):null;
  const access=await staffAccess(user);
  const nextRound=await db().prepare("SELECT id,title,opens,prize FROM rounds WHERE kind='weekly' AND opens>unixepoch() ORDER BY opens ASC,rowid ASC LIMIT 1").first<{id:string;title:string;opens:number;prize:string}>();
  const base={nextRound,signedIn:!!user,providers:loginOptions(),profile,club,admin:access.role!=="participant",role:access.role};
  // The public tournament is the default for everyone. Private practice rounds
  // are opened explicitly and must never replace the main tournament on reload.
  if (!id) {
    const latest=await db().prepare(`SELECT id FROM rounds WHERE kind='weekly' AND opens<=unixepoch()
      ORDER BY (closes>unixepoch()) DESC,opens DESC,rowid DESC LIMIT 1`).first<{id:string}>();
    id=latest?.id??null;
  }
  if (!id) return json({...base,setup:!!user});
  await ensureSubmissionDeadline(id);
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
  const overall=await db().prepare("SELECT winner_id FROM overall_outcomes WHERE round_id=?").bind(id).first<{winner_id:string|null}>();
  const motor=await db().prepare("SELECT entry_id FROM motors WHERE round_id=? AND voter=?").bind(id,user??"").first<{entry_id:string}>();
  const enabled=!!await db().prepare("SELECT round_id FROM charged_rounds WHERE round_id=?").bind(id).first();
  const overallWinner=entries.find(e=>e.id===overall?.winner_id);
  const winner=r.winner_id ? entries.find(entry=>entry.id===r.winner_id) : undefined;
  const own=user?await db().prepare(`SELECT e.id,e.name,e.description,e.media,e.withdrawn,e.hidden,e.moderation_state,e.moderation_reason,
    (SELECT count(*) FROM votes v WHERE v.entry_id=e.id AND v.value=1 AND v.created>=r.opens AND v.created<r.closes) AS likes,
    (SELECT count(*) FROM motors m WHERE m.entry_id=e.id AND m.created>=r.opens AND m.created<r.closes) AS motors
    FROM entries e JOIN rounds r ON r.id=e.round_id WHERE e.round_id=? AND e.owner=? AND e.superseded_by IS NULL
    ORDER BY e.created DESC,e.rowid DESC LIMIT 1`).bind(id,user).first<{id:string;name:string;description:string;media:string;withdrawn:number;hidden:number;moderation_state:string;moderation_reason:string;likes:number;motors:number}>():null;
  const standing=own?[...entries].sort((a,b)=>b.score-a.score||a.created-b.created||a.entryOrder-b.entryOrder).findIndex(e=>e.id===own.id):-1;
  const myEntry=own?{id:own.id,name:own.name,description:own.description,withdrawn:own.withdrawn,hidden:own.hidden,
    moderation_state:own.moderation_state,moderation_reason:own.moderation_reason,
    image:garagePhoto(own.media)?.image??"/api/media/"+own.id,likes:own.likes,score:own.likes+5*own.motors,rank:standing<0?null:standing+1}:null;
  return json({
    ...base,myEntry,
    round:{submissionsClose:r.submission_closes,submissionsClosed:r.server_time>=r.submission_closes,id:r.id,kind:r.kind,opens:r.opens,closes:r.closes,closed,serverTime:r.server_time,title:r.title,
      notice:r.notice,prize:r.prize,announced:r.announced},
    winner:winner ? {id:winner.id,name:winner.name,likes:winner.likes,nickname:winner.nickname}:null,
    entries,overallWinner:overallWinner??null,motor:{enabled,spentEntry:motor?.entry_id??null,available:enabled&&profile.premium&&!motor&&!closed},
  });
}


async function upload(req: Request, user: string, id: string, replacing?:string, retry=false) {
  if (!(await getProfile(user)).nickname) return failure("nickname_required",409);
  const r=await getRound(id,user);
  if (!r) return failure("not_found",404);
  if (r.server_time>=r.submission_closes||r.server_time<r.opens) return failure("submissions_closed",409);
  if (r.server_time>=r.closes) return failure("closed",409);
  if(replacing){
    if(!retry&&!(await getProfile(user)).premium)return failure('premium_required',403);
    const current=await db().prepare(`SELECT id FROM entries WHERE id=? AND round_id=? AND owner=? AND ${retry?"moderation_state='rejected'":'hidden=0'} AND superseded_by IS NULL`).bind(replacing,id,user).first();
    if(!current)return failure('not_found',404);
  } else if(await db().prepare('SELECT id FROM entries WHERE round_id=? AND owner=?').bind(id,user).first())return failure('entry_exists',409);
  if (Number(req.headers.get("content-length")||0)>maxUpload+16000) return failure("invalid_image",413);
  const form=await boundedForm(req);
  if (!form) return failure("invalid_entry");
  const name=String(form.get("name")??"").trim(), description=String(form.get("description")??"").trim();
  if(replacing&&form.get("resetConsent")!=="yes")return failure("invalid_entry");
  const retryOrder=retry?String(form.get('retryOrder')??''):null;
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
    if(replacing){
      const batch=await db().batch([
        retry?db().prepare(retryOld).bind(entry,replacing,id,user,retryOrder):db().prepare(replaceOld).bind(entry,replacing,id,user,user,user),
        db().prepare(replaceNew).bind(entry,name,description,key,replacing,entry),
        db().prepare(entryAudit).bind(crypto.randomUUID(),id,user,'entry_replaced',replacing),
        db().prepare(resetOldVotes).bind(replacing,entry),
        ...(retry?[db().prepare("UPDATE entries SET hidden=1,moderation_state='pending' WHERE id=?").bind(entry),db().prepare('UPDATE commerce_entitlements SET consumed=1 WHERE order_id=? AND EXISTS(SELECT 1 FROM entries WHERE id=?)').bind(retryOrder,entry)]:[]),
      ]);
      result=batch[1];
    } else result=await db().prepare(insertEntry).bind(entry,user,name,description,key,id,user,user).run();
  } catch (e) {
    await config.BUCKET.delete(key).catch(()=>{});
    throw e;
  }
  if (!result.meta.changes) {
    await config.BUCKET.delete(key).catch(()=>{});
    if(replacing)return entryMutationError(user,id,replacing);
    const latest=await getRound(id,user);
    return failure(latest && latest.server_time<latest.submission_closes ? "entry_exists" : "submissions_closed",409);
  }
  await refreshReferrals(user);
  return json({id:entry},201);
}

async function media(id: string, user: string|null) {
  const row=await db().prepare(`SELECT e.media FROM entries e JOIN rounds r ON r.id=e.round_id
    WHERE e.id=? AND ((e.withdrawn=0 AND e.hidden=0 AND (r.owner=? OR r.kind='weekly')) OR (e.owner=? AND e.superseded_by IS NULL) OR ?=1
      OR EXISTS(SELECT 1 FROM round_organizers a JOIN organizers o ON o.user_id=a.user_id WHERE a.round_id=r.id AND a.user_id=?))`)
    .bind(id,user??"",user??"",Number(await isAdministrator(user)),user??"").first<{media:string}>();
  if (!row?.media.startsWith("entries/")) return failure("not_found",404);
  const object=await config.BUCKET.get(row.media);
  if (!object) return failure("not_found",404);
  return new Response(object.body,{headers:{"Content-Type":object.httpMetadata?.contentType??"application/octet-stream","X-Content-Type-Options":"nosniff","Cache-Control":"no-store","Content-Security-Policy":"default-src 'none'"}});
}

async function handle(req: Request) {
  const url=new URL(req.url), path=url.pathname.split("/").filter(Boolean).slice(1).join("/");
  const method=req.method;
  if(path==='payments/webhook'&&method==='POST')return paymentWebhook(req);
  if (method!=="GET" && req.headers.get("origin")!==origin(req)) return failure("forbidden",403);
  if (path.startsWith("auth/")) return authRoute(req,path);
  const user=await currentUser(req);
  if(path==="account"&&method==="DELETE")return user?deleteAccount(req,user):failure("sign_in",401);
  if (user) await ensureParticipant(user,referralCode(req));
  if(method==='GET'&&path==='commerce/catalog')return catalogRoute(user);
  if(method==='GET'&&path==='sponsors')return json(await sponsorPublic(url.searchParams.get('round')??undefined));
  if(method==='GET'&&path==='promotions')return json({entries:await spotlight(url.searchParams.get('round')??undefined)});
  if(method==='GET'&&path==='trophies'){await settleRoundAwards();return trophyList(user);}
  const trophyMatch=path.match(/^trophies\/([a-zA-Z0-9-]{1,120})(?:\/(metadata|wallet|revoke|mint-intent|confirm-mint))?$/);
  if(trophyMatch&&method==='GET')return trophyMatch[2]==='metadata'?trophyMetadata(trophyMatch[1]):trophyPublic(trophyMatch[1]);
  const eventMatch=path.match(/^sponsors\/([a-zA-Z0-9-]{1,70})\/(impression|click|promo)$/);
  if(eventMatch&&method==='POST')return sponsorEvent(req,eventMatch[1],eventMatch[2]);
  if (method==="GET" && path==="rounds") return publicTours(req);
  if (method==="GET" && path==="state") return state(req,user);
  if (method==="GET" && path==="winners") {await settleRoundAwards();return winnersRoute(req,user);}
  const [resource,id,action,entryId]=path.split("/");
  if (method==="GET" && resource==="avatars" && validId.test(id??"")) return avatarMedia(id);
  if (method==="GET" && resource==="media" && validId.test(id??"")) return media(id,user);
  if (resource==="entries" && action==="comments" && validId.test(id??"")) return failure("not_found",404);
  if (!user) return failure("sign_in",401);
  if(path==='commerce/orders'&&method==='POST')return createOrder(req,user);
  const orderMatch=path.match(/^commerce\/orders\/([a-zA-Z0-9-]{1,70})\/(checkout|cancel|refund)$/);
  if(orderMatch&&method==='POST')return orderMatch[2]==='checkout'?checkout(req,user,orderMatch[1]):orderAction(req,user,orderMatch[1],orderMatch[2]);
  if(path==='partners/leads'&&method==='POST')return partnerLead(req,user);
  if(trophyMatch&&method==='POST')return trophyAction(req,user,trophyMatch[1],trophyMatch[2]);
  if(path.startsWith('admin/commerce'))return commerceAdmin(req,user,path.split('/').slice(2));
  if(path.startsWith('admin/sponsors'))return sponsorsAdmin(req,user,path.split('/').slice(2));
  if(path.startsWith('admin/moderation/')&&method==='POST')return moderation(req,user,path.split('/')[2]);
  if (path==="referrals/ack" && method==="POST") return acknowledgeClub(req,user);
  if (resource==="admin") {await settleRoundAwards();return adminRoute(req,user,path.split("/").slice(1));}
  if (path==="profile/avatar" && method==="PUT") return saveAvatar(req,user);
  if (path==="profile/avatar" && method==="DELETE") return removeAvatar(user);
  if (resource==="profile" && method==="PUT") return profileRoute(req,user,path);
  if (path==="rounds" && method==="POST") {
    const body=await req.json().catch(()=>null) as Record<string,unknown> | null;
    if (body?.kind!=="weekly" && body?.kind!=="test") return failure("invalid_entry");
    if (body.kind==="weekly" && !await isAdministrator(user)) return failure("forbidden",403);
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
  if (action==="motors" && method==="PUT" && validId.test(entryId??"")) return motorRoute(user,id,entryId);
  if(action==='retry'&&method==='PUT'&&validId.test(entryId??''))return upload(req,user,id,entryId,true);
  if (action==="entries" && validId.test(entryId??"") && (method==="PUT"||method==="DELETE")) {
    await ensureSubmissionDeadline(id);
    return method==='PUT'?upload(req,user,id,entryId):withdrawEntry(user,id,entryId);
  }
  if (action==="entries" && !entryId && method==="POST") return upload(req,user,id);
  if (action==="votes" && validId.test(entryId??"") && ["PUT","DELETE"].includes(method)) {
    const adding=method==="PUT";
    const change=adding?db().prepare(insertVote).bind(user,entryId,id,user,user)
      :db().prepare(removeVote).bind(entryId,user,id,user);
    const event="vote"+(adding?"_added":"_removed");
    const [result]=await db().batch([change,db().prepare(voteAudit).bind(id,entryId,user,event)]);
    if (result.meta.changes) {await refreshReferrals(user);return json({ok:true});}
    const row=await db().prepare(`SELECT e.owner AS author,r.closes,r.opens,unixepoch() AS clock FROM entries e JOIN rounds r ON r.id=e.round_id
      WHERE e.id=? AND r.id=? AND e.withdrawn=0 AND e.hidden=0 AND (r.owner=? OR r.kind='weekly')
        AND (r.kind='test' OR e.media NOT LIKE 'sample:%')`).bind(entryId,id,user).first<{author:string;closes:number;opens:number;clock:number}>();
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
    await cleanupDeletedMedia();
    const code=new URL(req.url).searchParams.get("ref");
    if (code && referralCode(req)===code) response.headers.append("Set-Cookie",cookieHeader(referralCookie,code,30*86400));
    return response;
  }
  catch (error) { if(/account_deleted/.test(String(error)))return failure("sign_in",401);console.error("Tune Arena handler failure",error instanceof Error ? error.name:"unknown"); return failure("server_error",500); }
}
export const GET=safe, POST=safe, PUT=safe, DELETE=safe;
