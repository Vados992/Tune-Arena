import { db, json } from "./worker";
import { garagePhoto } from "./garage";

type Outcome = {
  id:string; kind:string; title:string; closes:number; prize:string; announced:number;
  winner_id:string|null; name:string|null; media:string|null; nickname:string|null; votes:number;
};

export function offsetOf(req:Request,key="offset") {
  const value=new URL(req.url).searchParams.get(key)??"";
  return /^\d{1,5}$/.test(value)?Number(value):0;
}

export async function winnersRoute(req:Request,user:string|null) {
  const offset=offsetOf(req);
  const {results}=await db().prepare(`WITH finished AS (
      SELECT id,kind,title,closes,prize,announced FROM rounds
      WHERE closes<=unixepoch() AND (kind='weekly' OR owner=?)
      ORDER BY closes DESC,id DESC LIMIT 31 OFFSET ?
    )
    SELECT f.*,o.winner_id,e.name,e.media,p.nickname,
      (SELECT count(*) FROM votes v WHERE v.entry_id=e.id AND v.value=1 AND v.created>=r.opens AND v.created<r.closes) AS votes
    FROM finished f JOIN rounds r ON r.id=f.id JOIN round_outcomes o ON o.round_id=f.id
    LEFT JOIN entries e ON e.id=o.winner_id LEFT JOIN profiles p ON p.id=e.owner
    ORDER BY f.closes DESC,f.id DESC`).bind(user??"",offset).all<Outcome>();
  const rounds=results.slice(0,30).map(r=>{
    const photo=garagePhoto(r.media??"");
    return {id:r.id,kind:r.kind,title:r.title,closedAt:r.closes,prize:r.prize,announced:r.announced,
      winner:r.winner_id?{id:r.winner_id,name:photo?.title??r.name,nickname:r.nickname,votes:r.votes,
        photo:photo?.image??"/api/media/"+r.winner_id}:null};
  });
  return json({rounds,next:results.length>30?offset+30:null});
}

export async function adminOverview() {
  const [summary,events]=await db().batch([
    db().prepare(`SELECT
      (SELECT count(*) FROM rounds) AS rounds,
      (SELECT count(*) FROM rounds WHERE opens<=unixepoch() AND closes>unixepoch()) AS active,
      (SELECT count(*) FROM round_outcomes) AS finished,
      (SELECT count(*) FROM round_outcomes WHERE winner_id IS NOT NULL) AS winners,
      (SELECT count(*) FROM entries WHERE media NOT LIKE 'sample:%') AS entries,
      (SELECT count(*) FROM votes WHERE value=1) AS votes,
      (SELECT count(*) FROM votes WHERE value=-1) AS dislikes,
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
  return json({summary:summary.results[0],activity:events.results});
}
