import { db, failure, json } from "./worker";
import { accessAudit, accessRoute, canManageRound, staffAccess } from "./access";
import { frames, sampleGarage, garagePhoto } from "./garage";
import { adminOverview, offsetOf } from "./results";

import {defaultSubmissionDeadline,lisbonDeadline} from "./submission-deadline.mjs";
import {ensureSubmissionDeadline} from "./deadlines";

export const validId = /^[a-zA-Z0-9-]{1,70}$/;

export function cleanText(value:unknown,max:number) {
  if (typeof value!=="string") return null;
  const normalized=value.trim();
  return normalized.length<=max ? normalized : null;
}
async function body(req:Request) {
  return await req.json().catch(()=>null) as Record<string,unknown>|null;
}

export async function getProfile(user:string|null) {
  if (!user) return {nickname:null,premium:false,premiumUntil:0,trialUsed:false,frame:"plain",gift:false};
  const champion=await db().prepare(`SELECT count(*) AS titles FROM round_awards a JOIN entries e ON e.id=a.overall_entry JOIN rounds r ON r.id=a.round_id WHERE e.owner=? AND r.kind='weekly'`).bind(user).first<{titles:number}>();
  const p=await db().prepare(`SELECT nickname,frame,gift,premium_until,premium_until>unixepoch() AS premium, (SELECT id FROM avatars WHERE owner=profiles.id) AS avatar_id
    FROM profiles WHERE id=?`).bind(user).first<{nickname:string|null;frame:string;gift:number;premium:number;premium_until:number;avatar_id:string|null}>();
  return {avatar:p?.avatar_id?"/api/avatars/"+p.avatar_id:null,championTitles:champion?.titles??0,nickname:p?.nickname??null,premium:!!p?.premium,premiumUntil:p?.premium_until??0,
    trialUsed:(p?.premium_until??0)>0,frame:p?.premium?p.frame:"plain",gift:!!p?.gift};
}

export async function profileRoute(req:Request,user:string,path:string) {
  const data=await body(req);
  if (path==="profile/nickname") {
    const nickname=cleanText(data?.nickname,24)?.normalize("NFKC");
    if (!nickname || !/^[\p{L}\p{N}][\p{L}\p{N}_-]{2,23}$/u.test(nickname)) return failure("invalid_nickname");
    const key=nickname.toLowerCase();
    try {
      await db().prepare(`INSERT INTO profiles(id,nickname,nickname_key) VALUES(?,?,?)
        ON CONFLICT(id) DO UPDATE SET nickname=excluded.nickname,nickname_key=excluded.nickname_key`)
        .bind(user,nickname,key).run();
    } catch (error) {
      if (/unique constraint/i.test(String(error))) return failure("nickname_taken",409);
      throw error;
    }
    return json({nickname});
  }
  if (path==="profile/frame") {
    const frame=data?.frame;
    if (typeof frame!=="string" || !frames.some(value=>value===frame)) return failure("invalid_frame");
    const result=await db().prepare(`UPDATE profiles SET frame=? WHERE id=?
      AND (?='plain' OR (premium_until>unixepoch() AND (?<>'flame' OR gift=1)))`).bind(frame,user,frame,frame).run();
    return result.meta.changes?json({ok:true}):failure("premium_required",403);
  }
  return failure("not_found",404);
}

export async function createRound(user:string,kind:"test"|"weekly",config?:{title:string;notice:string;prize:string;minutes:number;submissionDeadline?:number},organizer=false) {
  const id=crypto.randomUUID(), openSeconds=kind==="test"?60:(config?.minutes??10080)*60;
  const clock=await db().prepare("SELECT unixepoch() AS t").first<{t:number}>();
  const start=clock!.t;
  const deadline=config?.submissionDeadline??defaultSubmissionDeadline(start,start+openSeconds,kind);
  await db().batch([
    db().prepare(`INSERT INTO rounds(id,owner,kind,opens,closes,title,notice,prize,submission_closes)
      VALUES(?,?,?,unixepoch(),unixepoch()+?,?,?,?,?)`)
      .bind(id,user,kind,openSeconds,config?.title??"",config?.notice??"",config?.prize??"",deadline),
    ...(organizer ? [
      db().prepare("INSERT INTO round_organizers(round_id,user_id,granted_by,created) VALUES(?,?,?,unixepoch())").bind(id,user,user),
      accessAudit(user,"round_created",user,id),
    ] : []),
    ...(kind!=="test"?[]:Object.entries(sampleGarage).map(([key,photo],i)=>db().prepare(
      "INSERT INTO entries(id,round_id,owner,name,description,media,created) VALUES(?,?,?,?,?,?,unixepoch()+?)"
    ).bind(key+"-"+id,id,"sample:"+key,photo.title,"sample:"+key,"sample:"+key,-3+i))),
  ]);
  return id;
}

async function writeAudit(change:D1PreparedStatement,user:string,round:string,action:string,target:string) {
  const [result]=await db().batch([change,db().prepare(`INSERT INTO admin_events(id,round_id,actor,action,target,created)
    SELECT ?,?,?,?,?,unixepoch() WHERE changes()>0`).bind(crypto.randomUUID(),round,user,action,target)]);
  return result.meta.changes;
}

export async function adminRoute(req:Request,user:string,path:string[]) {
  const [section,id,action,target]=path;
  if (section==="access") return accessRoute(req,user,path.slice(1));
  const access=await staffAccess(user);
  if (access.role==="participant") return failure("forbidden",403);
  if (req.method==="GET" && section==="session" && !id) return json(access);
  if (req.method==="GET" && section==="overview" && !id) return adminOverview(access.role==="organizer"?user:undefined,access);
  if (section!=="rounds") return failure("not_found",404);
  if (req.method==="GET" && !id) {
    const offset=offsetOf(req);
    const result=await db().prepare(`SELECT id,kind,title,opens,closes,announced,closes<=unixepoch() AS closed,
      (SELECT count(*) FROM entries WHERE round_id=rounds.id AND hidden=0 AND withdrawn=0) AS entries
      FROM rounds WHERE (?=1 OR EXISTS(SELECT 1 FROM round_organizers a JOIN organizers o ON o.user_id=a.user_id
        WHERE a.round_id=rounds.id AND a.user_id=?))
      ORDER BY opens DESC,rowid DESC LIMIT 61 OFFSET ?`).bind(Number(access.role==="owner"),user,offset).all();
    return json({rounds:result.results.slice(0,60),next:result.results.length>60?offset+60:null});
  }
  if (req.method==="POST" && !id) {
    if (!access.canCreate) return failure("forbidden",403);
    if (access.role==="organizer") {
      const quota=await db().prepare("SELECT count(*) AS n FROM rounds WHERE owner=? AND opens>unixepoch()-3600").bind(user).first<{n:number}>();
      if ((quota?.n??0)>=12) return failure("rate_limited",429);
    }
    const p=await body(req);
    const title=cleanText(p?.title,65),notice=cleanText(p?.notice,200),prize=cleanText(p?.prize,80),minutes=p?.minutes;
    if (!title || notice===null || prize===null || typeof minutes!=="number" || !Number.isInteger(minutes) || minutes<1 || minutes>43200) return failure("invalid_round");
    const clock=await db().prepare("SELECT unixepoch() AS t").first<{t:number}>();
    const submissionDeadline=p?.submissionDeadline?typeof p.submissionDeadline==='string'?lisbonDeadline(p.submissionDeadline):null:undefined;
    if(submissionDeadline===null||submissionDeadline!==undefined&&(submissionDeadline<=clock!.t||submissionDeadline>clock!.t+minutes*60))return failure('invalid_deadline');
    return json({id:await createRound(user,"weekly",{title,notice,prize,minutes,submissionDeadline},access.role==="organizer")},201);
  }
  if (!validId.test(id??"")) return failure("not_found",404);
  if (!await canManageRound(user,id)) return failure("forbidden",403);
  await ensureSubmissionDeadline(id);
  const round=await db().prepare(`SELECT r.submission_closes,r.id,r.kind,r.opens,r.title,r.notice,r.prize,r.closes,r.announced,
    r.closes<=unixepoch() AS closed,o.winner_id,(SELECT overall_entry FROM round_awards a WHERE a.round_id=r.id) AS overall_winner_id FROM rounds r LEFT JOIN round_outcomes o ON o.round_id=r.id WHERE r.id=?`)
    .bind(id).first();
  if (!round) return failure("not_found",404);
  if (req.method==="GET" && !action) {
    const entryOffset=offsetOf(req,"entries"),voteOffset=offsetOf(req,"votes");
    const items=await db().batch([
      db().prepare(`SELECT e.id,e.name,e.media,e.moderation_state,e.moderation_reason,e.hidden,e.withdrawn,e.superseded_by,e.created,p.nickname,
        (SELECT count(*) FROM votes v WHERE v.entry_id=e.id AND v.value=1 AND v.created>=r.opens AND v.created<r.closes) AS votes,
        (SELECT count(*) FROM votes v WHERE v.entry_id=e.id AND v.value=-1 AND v.created>=r.opens AND v.created<r.closes) AS dislikes,
        (SELECT count(*) FROM motors m WHERE m.entry_id=e.id AND m.created>=r.opens AND m.created<r.closes) AS motors,
        (SELECT count(*) FROM votes v WHERE v.entry_id=e.id AND v.value=1 AND v.created>=r.opens AND v.created<r.closes)+5*(SELECT count(*) FROM motors m WHERE m.entry_id=e.id AND m.created>=r.opens AND m.created<r.closes) AS score
        FROM entries e JOIN rounds r ON r.id=e.round_id LEFT JOIN profiles p ON p.id=e.owner
        WHERE e.round_id=? ORDER BY EXISTS(SELECT 1 FROM commerce_entitlements c WHERE c.entry_id=e.id AND c.kind='priority' AND c.revoked=0 AND c.ends>unixepoch()) DESC,e.withdrawn,e.hidden,votes DESC,e.created,e.rowid LIMIT 51 OFFSET ?`).bind(id,entryOffset),
      db().prepare("SELECT action,target,created FROM admin_events WHERE round_id=? AND action NOT LIKE 'comments_%' ORDER BY created DESC,rowid DESC LIMIT 20").bind(id),
      db().prepare(`SELECT v.id,v.action,v.created,e.name,p.nickname FROM vote_events v
        JOIN entries e ON e.id=v.entry_id LEFT JOIN profiles p ON p.id=v.actor WHERE v.round_id=?
        ORDER BY v.created DESC,v.id DESC LIMIT 41 OFFSET ?`).bind(id,voteOffset),
    ]);
    const catalog=items[0].results as Array<{id:string;media:string;name:string;hidden:number;created:number;nickname:string|null;votes:number}>;
    const entries=catalog.slice(0,50).map(({media,...row})=>{
      const photo=garagePhoto(media);
      return {...row,name:photo?.title??row.name,photo:photo?.image??"/api/media/"+row.id};
    });
    return json({round,entries,events:items[1].results,voteActivity:items[2].results.slice(0,40),
      next:{entries:catalog.length>50?entryOffset+50:null,
        votes:items[2].results.length>40?voteOffset+40:null}});
  }
  if (req.method==="POST" && action==="announce") {
    const change=db().prepare(`UPDATE rounds SET announced=unixepoch()
      WHERE id=? AND announced=0 AND EXISTS(
        SELECT 1 FROM round_outcomes WHERE round_id=rounds.id AND winner_id IS NOT NULL) OR (id=? AND announced=0 AND EXISTS(SELECT 1 FROM round_awards a WHERE a.round_id=rounds.id AND a.overall_entry IS NOT NULL))`).bind(id,id);
    if (round.announced) return json({ok:true});
    const changed=await writeAudit(change,user,id,"winner_announced",id);
    if (changed || await db().prepare("SELECT id FROM rounds WHERE id=? AND announced>0").bind(id).first()) return json({ok:true});
    return failure("winner_not_ready",409);
  }
  if (req.method==="POST" && action==="notice") {
    const p=await body(req),notice=cleanText(p?.notice,200);
    if (notice===null) return failure("invalid_round");
    const change=db().prepare("UPDATE rounds SET notice=? WHERE id=?").bind(notice,id);
    await writeAudit(change,user,id,"notice_updated",id);
    return json({ok:true});
  }
  if (req.method==="POST" && validId.test(target??"") && action==="entries") {
    const p=await body(req);
    if (typeof p?.hidden!=="boolean") return failure("invalid_entry");
    const hidden=p.hidden?1:0;
    const change=db().prepare(`UPDATE entries SET hidden=? WHERE id=? AND round_id=?
          AND EXISTS(SELECT 1 FROM rounds WHERE id=entries.round_id AND closes>unixepoch())`).bind(hidden,target,id);
    const changed=await writeAudit(change,user,id,action+(hidden?"_hidden":"_restored"),target);
    return changed?json({ok:true}):failure(action==="entries"&&round.closed?"closed":"not_found",action==="entries"&&round.closed?409:404);
  }
  return failure("not_found",404);
}
