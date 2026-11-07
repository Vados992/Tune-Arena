import { cookie, db, failure, json, origin } from "./worker";
import { registerReferral, welcomePremium, qualifyReferrals, calculateRewards, creditRewards, settleRewards } from "./referral-sql";

export const referralCookie="ta_ref";
export const validReferral=/^[a-f0-9]{32}$/;
export type Club = {
  url:string; invited:number; active:number; progress:number; goal:number;
  earnedMonths:number; pendingRewardDays:number; welcomePending:boolean;
};

export function referralCode(req:Request) {
  const value=new URL(req.url).searchParams.get("ref")??cookie(req,referralCookie);
  return validReferral.test(value)?value:"";
}

export async function ensureParticipant(user:string,code="") {
  // The first profile creation is the sole enrollment opportunity. Existing
  // profiles, self-invites, retries and changing the URL cannot earn a welcome gift.
  await db().batch([
    db().prepare("INSERT OR IGNORE INTO profiles(id) VALUES(?)").bind(user),
    db().prepare(registerReferral).bind(user,code,user),
    db().prepare(welcomePremium).bind(user),
  ]);
}

async function credit(user:string) {
  await db().batch([
    db().prepare("INSERT OR IGNORE INTO referral_rewards(inviter) VALUES(?)").bind(user),
    db().prepare(calculateRewards).bind(user),
    db().prepare(creditRewards).bind(user),
    db().prepare(settleRewards).bind(user),
  ]);
}

export async function refreshReferrals(user:string) {
  await db().prepare(qualifyReferrals).bind(user,user).run();
  const parent=await db().prepare("SELECT inviter FROM referrals WHERE invitee=?").bind(user).first<{inviter:string}>();
  if (parent) await credit(parent.inviter);
  await credit(user);
}

export async function getClub(req:Request,user:string):Promise<Club> {
  await db().prepare("INSERT OR IGNORE INTO referral_codes(user_id,code) VALUES(?,?)")
    .bind(user,crypto.randomUUID().replace(/-/g,"")).run();
  const row=await db().prepare(`SELECT c.code,
    (SELECT count(*) FROM referrals WHERE inviter=c.user_id) AS invited,
    (SELECT count(*) FROM referrals WHERE inviter=c.user_id AND qualified>0) AS active,
    coalesce(r.credited_batches,0) AS earned,
    coalesce(r.credited_batches-r.notified_batches,0) AS pending,
    EXISTS(SELECT 1 FROM referrals WHERE invitee=c.user_id AND welcome_seen=0) AS welcome
    FROM referral_codes c LEFT JOIN referral_rewards r ON r.inviter=c.user_id WHERE c.user_id=?`)
    .bind(user).first<{code:string;invited:number;active:number;earned:number;pending:number;welcome:number}>();
  if (!row) throw new Error("Referral code missing");
  const url=new URL("/",origin(req));url.searchParams.set("ref",row.code);url.searchParams.set("club","1");
  return {url:url.href,invited:row.invited,active:row.active,progress:row.active%3,goal:3,
    earnedMonths:row.earned,pendingRewardDays:row.pending*30,welcomePending:!!row.welcome};
}

export async function acknowledgeClub(req:Request,user:string) {
  const body=await req.json().catch(()=>null) as {rewardBatches?:unknown;welcome?:unknown}|null;
  if (!body || !Number.isSafeInteger(body.rewardBatches) || Number(body.rewardBatches)<0) return failure("invalid_entry");
  await db().batch([
    db().prepare(`UPDATE referral_rewards SET notified_batches=max(notified_batches,min(credited_batches,?))
      WHERE inviter=?`).bind(body.rewardBatches,user),
    db().prepare("UPDATE referrals SET welcome_seen=1 WHERE invitee=? AND ?=1").bind(user,Number(body.welcome===true)),
  ]);
  return json({ok:true});
}
