import { db, failure, isAdministrator, json } from "./worker";

export type StaffAccess = { role: "owner" | "organizer" | "participant"; canCreate: boolean };

export async function staffAccess(user: string | null): Promise<StaffAccess> {
  if (!user) return { role: "participant", canCreate: false };
  if (await isAdministrator(user)) return { role: "owner", canCreate: true };
  const member = await db().prepare("SELECT can_create FROM organizers WHERE user_id=?").bind(user).first<{can_create:number}>();
  return member ? { role: "organizer", canCreate: !!member.can_create } : { role: "participant", canCreate: false };
}

// Membership and assignment are both checked on every request. Owning a round,
// buying Premium or changing a nickname never grants staff permissions.
export async function canManageRound(user: string | null, round: string) {
  if (!user) return false;
  if (await isAdministrator(user)) return true;
  return !!await db().prepare(`SELECT a.round_id FROM round_organizers a
    JOIN organizers o ON o.user_id=a.user_id WHERE a.round_id=? AND a.user_id=?`)
    .bind(round,user).first();
}

export function accessAudit(actor:string, action:string, subject:string, round:string|null=null) {
  return db().prepare(`INSERT INTO staff_events(id,actor,action,subject,round_id,created)
    VALUES(?,?,?,?,?,unixepoch())`).bind(crypto.randomUUID(),actor,action,subject,round);
}

export async function accessRoute(req:Request, actor:string, path:string[]) {
  if (!await isAdministrator(actor)) return failure("forbidden",403);
  if (!path.length && req.method==="GET") {
    const [members,events] = await db().batch([
      db().prepare(`SELECT o.user_id AS id,p.nickname,o.can_create AS canCreate,o.created,
        (SELECT count(*) FROM round_organizers a WHERE a.user_id=o.user_id) AS rounds
        FROM organizers o JOIN profiles p ON p.id=o.user_id ORDER BY p.nickname_key,o.user_id`),
      db().prepare(`SELECT e.id,e.action,e.round_id,e.created,p.nickname,r.title
        FROM staff_events e LEFT JOIN profiles p ON p.id=e.subject LEFT JOIN rounds r ON r.id=e.round_id
        ORDER BY e.created DESC,e.rowid DESC LIMIT 30`),
    ]);
    return json({members:members.results,events:events.results});
  }
  const data = req.method==="GET" ? null : await req.json().catch(()=>null) as Record<string,unknown>|null;
  if (!path.length && req.method==="POST") {
    if (typeof data?.nickname!=="string" || typeof data.canCreate!=="boolean") return failure("invalid_access");
    const nickname=data.nickname.trim().replace(/^@/,"").normalize("NFKC").toLowerCase();
    if (!nickname || nickname.length>24) return failure("invalid_access");
    const person=await db().prepare("SELECT id FROM profiles WHERE nickname_key=?").bind(nickname).first<{id:string}>();
    if (!person) return failure("profile_not_found",404);
    if (person.id===actor) return failure("owner_protected",409);
    await db().batch([
      db().prepare(`INSERT INTO organizers(user_id,can_create,granted_by,created) VALUES(?,?,?,unixepoch())
        ON CONFLICT(user_id) DO UPDATE SET can_create=excluded.can_create,granted_by=excluded.granted_by`)
        .bind(person.id,Number(data.canCreate),actor),
      accessAudit(actor,data.canCreate?"organizer_create_enabled":"organizer_granted",person.id),
    ]);
    return json({ok:true});
  }
  if (path.length===1 && path[0]==="revoke" && req.method==="POST") {
    if (typeof data?.userId!=="string" || data.userId.length>200) return failure("invalid_access");
    if (data.userId===actor) return failure("owner_protected",409);
    const member=await db().prepare("SELECT user_id FROM organizers WHERE user_id=?").bind(data.userId).first();
    if (!member) return failure("not_found",404);
    await db().batch([
      db().prepare("DELETE FROM round_organizers WHERE user_id=?").bind(data.userId),
      db().prepare("DELETE FROM organizers WHERE user_id=?").bind(data.userId),
      accessAudit(actor,"organizer_revoked",data.userId),
    ]);
    return json({ok:true});
  }
  if (path.length===2 && path[0]==="rounds" && /^[a-zA-Z0-9-]{1,70}$/.test(path[1])) {
    const round=path[1];
    if (!await db().prepare("SELECT id FROM rounds WHERE id=?").bind(round).first()) return failure("not_found",404);
    if (req.method==="GET") {
      const members=await db().prepare(`SELECT o.user_id AS id,p.nickname,
        EXISTS(SELECT 1 FROM round_organizers a WHERE a.user_id=o.user_id AND a.round_id=?) AS assigned
        FROM organizers o JOIN profiles p ON p.id=o.user_id ORDER BY p.nickname_key,o.user_id`).bind(round).all();
      return json({members:members.results});
    }
    if (req.method==="PUT") {
      if (typeof data?.userId!=="string" || data.userId.length>200 || typeof data.assigned!=="boolean") return failure("invalid_access");
      if (!await db().prepare("SELECT user_id FROM organizers WHERE user_id=?").bind(data.userId).first()) return failure("not_found",404);
      await db().batch([
        data.assigned ? db().prepare(`INSERT INTO round_organizers(round_id,user_id,granted_by,created) VALUES(?,?,?,unixepoch())
          ON CONFLICT(round_id,user_id) DO NOTHING`).bind(round,data.userId,actor)
          : db().prepare("DELETE FROM round_organizers WHERE round_id=? AND user_id=?").bind(round,data.userId),
        accessAudit(actor,data.assigned?"round_assigned":"round_unassigned",data.userId,round),
      ]);
      return json({ok:true});
    }
  }
  return failure("not_found",404);
}
