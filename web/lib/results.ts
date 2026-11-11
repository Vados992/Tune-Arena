import { db, json } from "./worker";
import { garagePhoto } from "./garage";
import type { StaffAccess } from "./access";

type Outcome = {
  id:string; kind:string; title:string; closes:number; prize:string; announced:number;
  overall_id:string|null; overall_name:string|null;overall_media:string|null;overall_nickname:string|null;overall_score:number;charged:number;
  winner_id:string|null; name:string|null; media:string|null; nickname:string|null; votes:number;
  rewarded_id:string|null;
};

export function offsetOf(req:Request,key="offset") {
  const value=new URL(req.url).searchParams.get(key)??"";
  return /^\d{1,5}$/.test(value)?Number(value):0;
}

export async function winnersRoute(req:Request,user:string|null) {
  const offset=offsetOf(req);
  const {results}=await db().prepare(`WITH finished AS (
      SELECT id,kind,title,closes,prize,announced FROM rounds
      WHERE closes<=unixepoch() AND kind='weekly'
      ORDER BY closes DESC,id DESC LIMIT 31 OFFSET ?
    )
    SELECT f.*,o.winner_id,e.name,e.media,p.nickname,awarded.popular_entry AS rewarded_id,
      a.winner_id AS overall_id,oe.name AS overall_name,oe.media AS overall_media,op.nickname AS overall_nickname,
      EXISTS(SELECT 1 FROM charged_rounds c WHERE c.round_id=f.id) AS charged,
      (SELECT count(*) FROM votes v WHERE v.entry_id=oe.id AND v.value=1 AND v.created>=r.opens AND v.created<r.closes)+5*(SELECT count(*) FROM motors m WHERE m.entry_id=oe.id AND m.created>=r.opens AND m.created<r.closes) AS overall_score,
      (SELECT count(*) FROM votes v WHERE v.entry_id=e.id AND v.value=1 AND v.created>=r.opens AND v.created<r.closes) AS votes
    FROM finished f JOIN rounds r ON r.id=f.id JOIN round_outcomes o ON o.round_id=f.id
    LEFT JOIN entries e ON e.id=o.winner_id LEFT JOIN profiles p ON p.id=e.owner
    LEFT JOIN overall_outcomes a ON a.round_id=f.id LEFT JOIN entries oe ON oe.id=a.winner_id
    LEFT JOIN profiles op ON op.id=oe.owner
    LEFT JOIN round_awards awarded ON awarded.round_id=f.id
    ORDER BY f.closes DESC,f.id DESC`).bind(offset).all<Outcome>();
  // Rank only visible, eligible entries inside the voting window, using the same
  // deterministic tie break as round_outcomes and overall_outcomes.
  const ids=results.slice(0,30).map(r=>r.id);
  const podiumRows=ids.length?(await db().prepare(`WITH scored AS (
    SELECT e.id,e.round_id,e.name,e.media,p.nickname,e.created,e.rowid AS entry_order,
    (SELECT count(*) FROM votes v WHERE v.entry_id=e.id AND v.value=1 AND v.created>=r.opens AND v.created<r.closes) AS hearts,
    (SELECT count(*) FROM motors m WHERE m.entry_id=e.id AND m.created>=r.opens AND m.created<r.closes) AS motors
    FROM entries e JOIN rounds r ON r.id=e.round_id LEFT JOIN profiles p ON p.id=e.owner
    WHERE e.round_id IN (${ids.map(()=>'?').join(',')}) AND e.hidden=0 AND e.withdrawn=0 AND e.media NOT LIKE 'sample:%'
  ), categories AS (
    SELECT *, 'popular' AS category, hearts AS points FROM scored WHERE hearts>0
    UNION ALL SELECT *, 'overall', hearts+5*motors FROM scored WHERE hearts+5*motors>0
  ), ranked AS (
    SELECT *,row_number() OVER(PARTITION BY round_id,category ORDER BY points DESC,created ASC,entry_order ASC) AS place FROM categories
  ) SELECT * FROM ranked WHERE place<=3 ORDER BY round_id,category,place`).bind(...ids).all<{id:string;round_id:string;name:string;media:string;nickname:string|null;hearts:number;motors:number;points:number;place:number;category:string}>()).results:[];
  const rounds=results.slice(0,30).map(r=>{
    const photo=garagePhoto(r.media??"");
    return {podium:{popular:podiumRows.filter(e=>e.round_id===r.id&&e.category==='popular').map(e=>({id:e.id,name:garagePhoto(e.media)?.title??e.name,nickname:e.nickname,place:e.place,points:e.points})),
      overall:podiumRows.filter(e=>e.round_id===r.id&&e.category==='overall').map(e=>({id:e.id,name:garagePhoto(e.media)?.title??e.name,nickname:e.nickname,place:e.place,points:e.points}))},id:r.id,kind:r.kind,title:r.title,closedAt:r.closes,prize:r.prize,announced:r.announced,
      charged:!!r.charged,rewardGranted:!!r.winner_id&&r.winner_id===r.rewarded_id&&!!r.charged&&r.kind==='weekly',
      overallWinner:r.overall_id?{id:r.overall_id,name:garagePhoto(r.overall_media??'')?.title??r.overall_name,nickname:r.overall_nickname,score:r.overall_score}:!r.charged&&r.winner_id?{id:r.winner_id,name:photo?.title??r.name,nickname:r.nickname,score:r.votes}:null,
      winner:r.winner_id?{id:r.winner_id,name:photo?.title??r.name,nickname:r.nickname,votes:r.votes,
        photo:photo?.image??"/api/media/"+r.winner_id}:null};
  });
  return json({rounds,next:results.length>30?offset+30:null});
}

export async function adminOverview(organizer?:string,access?:StaffAccess) {
  if (organizer) {
    const scope=`WITH scoped AS (SELECT r.* FROM rounds r JOIN round_organizers a ON a.round_id=r.id
      JOIN organizers o ON o.user_id=a.user_id WHERE a.user_id=?)`;
    const [summary,events]=await db().batch([
      db().prepare(`${scope} SELECT
        (SELECT count(*) FROM scoped) AS rounds,
        (SELECT count(*) FROM scoped WHERE opens<=unixepoch() AND closes>unixepoch()) AS active,
        (SELECT count(*) FROM scoped WHERE closes<=unixepoch()) AS finished,
        (SELECT count(*) FROM round_outcomes o JOIN scoped r ON r.id=o.round_id WHERE o.winner_id IS NOT NULL) AS winners,
        (SELECT count(*) FROM entries e JOIN scoped r ON r.id=e.round_id WHERE e.withdrawn=0 AND e.media NOT LIKE 'sample:%') AS entries,
        (SELECT count(*) FROM votes v JOIN entries e ON e.id=v.entry_id JOIN scoped r ON r.id=e.round_id WHERE v.value=1) AS votes,
        (SELECT count(*) FROM motors m JOIN scoped r ON r.id=m.round_id) AS motors`).bind(organizer),
      db().prepare(`${scope}, activity AS (
        SELECT 'round_started' AS action,id AS round_id,'' AS entry,opens AS created FROM scoped WHERE opens<=unixepoch()
        UNION ALL SELECT 'round_finished',id,'',closes FROM scoped WHERE closes<=unixepoch()
        UNION ALL SELECT 'entry_submitted',e.round_id,e.name,e.created FROM entries e JOIN scoped r ON r.id=e.round_id WHERE e.media NOT LIKE 'sample:%'
        UNION ALL SELECT v.action,v.round_id,e.name,v.created FROM vote_events v JOIN entries e ON e.id=v.entry_id JOIN scoped r ON r.id=v.round_id
        UNION ALL SELECT e.action,e.round_id,'',e.created FROM admin_events e JOIN scoped r ON r.id=e.round_id WHERE e.action NOT LIKE 'comments_%'
      ) SELECT a.*,r.title,r.kind FROM activity a JOIN scoped r ON r.id=a.round_id
        ORDER BY a.created DESC,a.round_id,a.action LIMIT 30`).bind(organizer),
    ]);
    return json({access,summary:summary.results[0],activity:events.results});
  }
  const [summary,events]=await db().batch([
    db().prepare(`SELECT
      (SELECT count(*) FROM rounds) AS rounds,
      (SELECT count(*) FROM rounds WHERE opens<=unixepoch() AND closes>unixepoch()) AS active,
      (SELECT count(*) FROM round_outcomes) AS finished,
      (SELECT count(*) FROM round_outcomes WHERE winner_id IS NOT NULL) AS winners,
      (SELECT count(*) FROM entries WHERE withdrawn=0 AND media NOT LIKE 'sample:%') AS entries,
      (SELECT count(*) FROM votes WHERE value=1) AS votes,
      (SELECT count(*) FROM votes WHERE value=-1) AS dislikes,
      (SELECT count(*) FROM motors) AS motors,
      (SELECT count(*) FROM profiles WHERE nickname IS NOT NULL) AS profiles,
      (SELECT count(*) FROM profiles WHERE premium_until>unixepoch()) AS premium`),
    db().prepare(`WITH activity AS (
      SELECT * FROM (SELECT 'round_started' AS action,id AS round_id,'' AS entry,opens AS created
        FROM rounds WHERE opens<=unixepoch() ORDER BY opens DESC LIMIT 30)
      UNION ALL SELECT * FROM (SELECT 'round_finished',id,'',closes
        FROM rounds WHERE closes<=unixepoch() ORDER BY closes DESC LIMIT 30)
      UNION ALL SELECT * FROM (SELECT 'entry_submitted',round_id,name,created
        FROM entries WHERE media NOT LIKE 'sample:%' ORDER BY created DESC LIMIT 30)
      UNION ALL SELECT * FROM (SELECT v.action,v.round_id,e.name,v.created
        FROM vote_events v JOIN entries e ON e.id=v.entry_id ORDER BY v.created DESC,v.id DESC LIMIT 30)
      UNION ALL SELECT * FROM (SELECT action,round_id,'',created FROM admin_events WHERE action NOT LIKE 'comments_%' ORDER BY created DESC LIMIT 30)
    )
    SELECT a.*,r.title,r.kind FROM activity a JOIN rounds r ON r.id=a.round_id
    ORDER BY a.created DESC,a.round_id,a.action LIMIT 30`),
  ]);
  return json({access,summary:summary.results[0],activity:events.results});
}

export async function publicTours(req:Request){
 const offset=offsetOf(req);
 const {results}=await db().prepare("SELECT id,title,opens,closes,prize FROM rounds WHERE kind='weekly' ORDER BY opens DESC,rowid DESC LIMIT 31 OFFSET ?").bind(offset).all();
 const clock=await db().prepare('SELECT unixepoch() AS now').first<{now:number}>();
 return json({rounds:results.slice(0,30),next:results.length>30?offset+30:null,serverTime:clock!.now});
}
