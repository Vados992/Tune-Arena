/*
 * Runs the production route handlers with a SQLite D1 adapter, in-memory R2,
 * fixture identities, and a controllable database clock.
 * Run from the project root with: node tests/arena_flow.mjs
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { build } from "esbuild";

let seconds=1800000000;
Date.now=()=>seconds*1000;
let viewer="owner";
let batchQueue=Promise.resolve();
const sql=new DatabaseSync(":memory:");
sql.exec("PRAGMA foreign_keys=ON");
sql.function("unixepoch",()=>seconds);
for (const migration of readdirSync("drizzle").filter(name=>name.endsWith(".sql")).sort()) {
  sql.exec(readFileSync("drizzle/"+migration,"utf8"));
}
const uploads=new Map();
globalThis.__tuneArenaFixture={
  identity:()=>viewer?{userId:viewer,email:viewer+"@example.invalid",fullName:null,displayName:viewer}:null,
  env:{
    TUNE_ADMIN_EMAIL:"owner@example.invalid",
    TRUST_SITE_AUTH:"1",
    DB:{
      prepare(query) {
        const statement=sql.prepare(query);
        function bound(params) {
          return {
            bind(...values){return bound(values);},
            async run(){return {meta:statement.run(...params)};},
            async first(){return statement.get(...params)??null;},
            async all(){return {results:statement.all(...params)};},
          };
        }
        return bound([]);
      },
      async batch(statements) {
        const previous=batchQueue;
        let unlock;
        batchQueue=new Promise(resolve=>{unlock=resolve;});
        await previous;
        sql.exec("BEGIN");
        try {
          const out=[];
          for (const statement of statements) {
            const result=await statement.all();
            out.push({...result,meta:{changes:sql.prepare("SELECT changes() AS n").get().n}});
          }
          sql.exec("COMMIT");
          return out;
        } catch (error) {
          sql.exec("ROLLBACK");
          throw error;
        } finally {unlock();}
      },
    },
    BUCKET:{
      async put(key,body,opts){uploads.set(key,{body,httpMetadata:opts.httpMetadata});},
      async get(key){return uploads.get(key);},
      async delete(key){uploads.delete(key);},
    },
  },
};

const output=await build({
  entryPoints:["app/api/[...action]/route.ts"],bundle:true,format:"esm",platform:"node",write:false,
  plugins:[{
    name:"tune-test-bindings",
    setup(builder) {
      builder.onResolve({filter:/^(cloudflare:workers|@\/app\/chatgpt-auth)$/},args=>({path:args.path,namespace:"fixture"}));
      builder.onLoad({filter:/.*/,namespace:"fixture"},args=>({
        contents:args.path==="cloudflare:workers"
          ? "export const env=globalThis.__tuneArenaFixture.env"
          : "export async function getChatGPTUser(){return globalThis.__tuneArenaFixture.identity()}",
      }));
    },
  }],
});
const routes=await import("data:text/javascript;base64,"+Buffer.from(output.outputFiles[0].text).toString("base64"));
const origin="https://arena.example.invalid";
async function request(path,method="GET",body,extraHeaders={}) {
  const headers={Origin:origin,...extraHeaders};
  if (body&&!(body instanceof FormData)) {headers["Content-Type"]="application/json";body=JSON.stringify(body);}
  const response=await routes[method](new Request(origin+"/api/"+path,{method,headers,body}));
  return {status:response.status,data:await response.json().catch(()=>null),cookie:response.headers.get("set-cookie")};
}
function entry(name) {
  const f=new FormData();
  f.set("name",name);
  f.set("description","Fixture tuning project");
  f.set("rights","yes");
  f.set("photo",new Blob([Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+Xf2UAAAAASUVORK5CYII=","base64"
  )],{type:"image/png"}),"fixture.png");
  return f;
}
async function createRound(title) {
  const r=await request("admin/rounds","POST",{title,notice:"Test announcement",prize:"",minutes:1});
  assert.equal(r.status,201);
  return r.data.id;
}

assert.equal((await request("state")).data.admin,true);
const round=await createRound("Automation test");
const base="rounds/"+round;
const admin="admin/rounds/"+round;
const state="state?round="+round;
const initial=await request(state);
const cutoff=initial.data.round.closes;
assert.equal((await request("winners")).data.rounds.length,0);
assert.equal((await request(admin+"/announce","POST")).status,409);

viewer="participant-a";
assert.equal((await request("state")).data.admin,false);
assert.equal((await request("admin/overview")).status,403);
assert.equal((await request(admin+"/announce","POST")).status,403);
assert.equal((await request("rounds","POST",{kind:"weekly"})).status,403);
assert.equal((await request("profile/nickname","PUT",{nickname:"Driver_A"})).status,200);
const first=await request(base+"/entries","POST",entry("First build"));
assert.equal(first.status,201);
const firstVote=base+"/votes/"+first.data.id;
assert.equal((await request(firstVote,"PUT")).data.error,"own_entry");

viewer="participant-b";
assert.equal((await request("profile/nickname","PUT",{nickname:"Driver_B"})).status,200);
const second=await request(base+"/entries","POST",entry("Second build"));
assert.equal(second.status,201);
const secondVote=base+"/votes/"+second.data.id;
assert.equal((await request(firstVote,"PUT")).status,200);
assert.equal((await request(firstVote,"PUT")).status,200);
assert.equal((await request(firstVote,"DELETE")).status,200);
assert.equal((await request(firstVote,"DELETE")).status,200);
assert.equal((await request(firstVote,"PUT")).status,200);

viewer="participant-a";
seconds=cutoff-1;
assert.equal((await request(secondVote,"PUT")).status,200);
assert.equal((await request(state)).data.winner,null);
assert.equal((await request("winners")).data.rounds.length,0);

// Nothing is called between the last vote and the deadline.
seconds=cutoff;
const result=await request("winners");
assert.equal(result.status,200);
assert.equal(result.data.rounds[0].winner.id,first.data.id);
assert.equal(result.data.rounds[0].winner.votes,1);
assert.equal(result.data.rounds[0].announced,0);
assert.equal((await request(state)).data.winner.id,first.data.id);
assert.equal((await request(secondVote,"PUT")).status,409);
assert.equal((await request(secondVote,"DELETE")).status,409);
assert.equal((await request("winners")).data.rounds[0].winner.id,first.data.id);

viewer="owner";
const detail=(await request(admin)).data;
assert.equal(detail.round.winner_id,first.data.id);
assert.equal(detail.voteActivity.length,4);
assert.equal(detail.voteActivity.filter(event=>event.action==="vote_removed").length,1);
assert(detail.voteActivity.some(event=>event.nickname==="Driver_A"));
assert.equal((await request(admin+"/announce","POST")).status,200);
assert.equal((await request(admin+"/announce","POST")).status,200);
assert.equal((await request(admin)).data.events.filter(event=>event.action==="winner_announced").length,1);
assert.equal((await request("winners")).data.rounds[0].announced,cutoff);
const overview=(await request("admin/overview")).data;
assert.equal(overview.summary.votes,2);
assert.equal(overview.summary.winners,1);
assert(overview.activity.some(event=>event.action==="round_finished"));

const emptyRound=await createRound("No votes");
const ownTest=(await request("rounds","POST",{kind:"test"})).data.id;
seconds+=60;
assert.equal((await request("winners")).data.rounds.find(item=>item.id===emptyRound).winner,null);
assert((await request("winners")).data.rounds.some(item=>item.id===ownTest));
assert.equal((await request("admin/rounds/"+emptyRound+"/announce","POST")).status,409);
viewer="participant-a";
assert(!(await request("winners")).data.rounds.some(item=>item.id===ownTest));
viewer=null;
assert.equal((await request("admin/overview")).status,401);
assert.equal((await request("winners")).status,200);
// Referral rewards run through the real handlers and migration schema.
viewer="owner";
const ownerClub=(await request("state")).data.club;
const inviteCode=new URL(ownerClub.url).searchParams.get("ref");
assert.match(inviteCode,/^[a-f0-9]{32}$/);
assert(!ownerClub.url.includes("site:owner"));
const invite="state?ref="+inviteCode;
assert.equal((await request(invite)).data.club.welcomePending,false); // self-invite
assert.equal(sql.prepare("SELECT count(*) n FROM referrals").get().n,0);
sql.prepare("UPDATE profiles SET premium_until=? WHERE id='site:owner'").run(seconds+5000);
const ownerPremium=seconds+5000;
viewer=null;
const landing=await request(invite);
assert.match(landing.cookie,/HttpOnly; Secure; SameSite=Lax/);
assert.match(landing.cookie,/Max-Age=2592000/);
assert.equal(landing.data.club,null);
assert.equal((await request("referrals/ack","POST",{rewardBatches:100})).status,401);

viewer="referred-one";
let one=await request("state","GET",undefined,{Cookie:"ta_ref="+inviteCode});
assert.equal(one.data.profile.premiumUntil,seconds+3*86400);
assert.equal(one.data.club.welcomePending,true);
for(let i=0;i<4;i++) await request(invite);
assert.equal((await request("state")).data.profile.premiumUntil,seconds+3*86400);
assert.equal((await request("premium","POST")).status,200);
assert.equal((await request("state")).data.profile.premiumUntil,seconds+3*86400);
assert.equal((await request("referrals/ack","POST",{rewardBatches:0,welcome:true})).status,200);
assert.equal((await request("state")).data.club.welcomePending,false);
assert.equal((await request("profile/nickname","PUT",{nickname:"Refer_One"})).status,200);

viewer="participant-a"; // An existing profile cannot claim a welcome gift.
assert.equal((await request(invite)).data.club.welcomePending,false);
assert.equal(sql.prepare("SELECT count(*) n FROM referrals").get().n,1);
viewer="bad-code";
assert.equal((await request("state?ref="+"0".repeat(32))).data.profile.premiumUntil,0);
viewer="owner";
const referralRound=await createRound("Referral activity");
const referralBase="rounds/"+referralRound;
const ten=[];
for(let i=0;i<10;i++) {
  viewer="build-author-"+i;
  await request("profile/nickname","PUT",{nickname:"Builder_"+i});
  const work=await request(referralBase+"/entries","POST",entry("Build "+i));
  assert.equal(work.status,201);ten.push(work.data.id);
}
viewer="owner";
await request("profile/nickname","PUT",{nickname:"Club_Owner"});
const parentWork=(await request(referralBase+"/entries","POST",entry("Inviter build"))).data.id;
viewer="referred-one";
// Ten toggles on one entry, inviter likes, sample likes and test uploads don't qualify.
for(let i=0;i<10;i++) {
  await request(referralBase+"/votes/"+ten[0],"PUT");
  await request(referralBase+"/votes/"+ten[0],"DELETE");
}
await request(referralBase+"/votes/"+parentWork,"PUT");
const personalTest=(await request("rounds","POST",{kind:"test"})).data.id;
assert.equal((await request("rounds/"+personalTest+"/votes/night-"+personalTest,"PUT")).status,200);
assert.equal((await request("rounds/"+personalTest+"/entries","POST",entry("Test build"))).status,201);
assert.equal(sql.prepare("SELECT qualified FROM referrals WHERE invitee='site:referred-one'").get().qualified,0);
for(const id of ten.slice(0,9)) assert.equal((await request(referralBase+"/votes/"+id,"PUT")).status,200);
assert.equal(sql.prepare("SELECT qualified FROM referrals WHERE invitee='site:referred-one'").get().qualified,0);
await request(referralBase+"/votes/"+ten[9],"PUT");
assert.equal(sql.prepare("SELECT qualified FROM referrals WHERE invitee='site:referred-one'").get().qualified,seconds);

for(let i=2;i<=6;i++) {
  viewer="referred-"+i;
  const welcome=await request(invite);
  assert.equal(welcome.data.profile.premiumUntil,seconds+3*86400);
  await request("profile/nickname","PUT",{nickname:"Refer_"+i});
  assert.equal((await request(referralBase+"/entries","POST",entry("Friend build "+i))).status,201);
  viewer="owner";
  const progress=(await request("state")).data;
  assert.equal(progress.club.invited,i);
  assert.equal(progress.club.active,i);
  assert.equal(progress.club.progress,i%3);
  assert.equal(progress.club.earnedMonths,Math.floor(i/3));
  assert.equal(progress.profile.premiumUntil,ownerPremium+Math.floor(i/3)*30*86400);
}
const rewardBefore=(await request("state")).data;
assert.equal(rewardBefore.club.pendingRewardDays,60);
// Concurrent polling/retries cannot credit the same group a second time.
const concurrent=await Promise.all(Array.from({length:8},()=>request("state")));
assert(concurrent.every(r=>r.status===200));
assert(concurrent.every(r=>r.data.profile.premiumUntil===ownerPremium+60*86400));
await request("referrals/ack","POST",{rewardBatches:1});
assert.equal((await request("state")).data.club.pendingRewardDays,30);
await request("referrals/ack","POST",{rewardBatches:2});
assert.equal((await request("state")).data.club.pendingRewardDays,0);
assert.equal((await request("referrals/ack","POST",{rewardBatches:-1})).status,400);
assert.equal((await request("referrals/ack","POST",{rewardBatches:999},{Origin:"https://foreign.invalid"})).status,403);
assert.equal((await request("state")).data.profile.premiumUntil,ownerPremium+60*86400);
// Expiration is real, and replaying an invite does not renew it.
viewer="referred-negative";
await request(invite);
await request("profile/nickname","PUT",{nickname:"Negative_Reactor"});
for(const id of ten) assert.equal((await request(referralBase+"/dislikes/"+id,"PUT")).status,200);
assert.equal(sql.prepare("SELECT qualified FROM referrals WHERE invitee='site:referred-negative'").get().qualified,0);
for(const id of ten) await request(referralBase+"/votes/"+id,"PUT");
assert.equal(sql.prepare("SELECT qualified FROM referrals WHERE invitee='site:referred-negative'").get().qualified,seconds);
viewer="referred-one";seconds+=3*86400;
assert.equal((await request(invite)).data.profile.premium,false);
await request("premium","POST");
assert.equal((await request(invite)).data.profile.premium,false);
viewer="owner";
const reactionRound=await createRound("Camera and reactions");
const reactionBase="rounds/"+reactionRound;
viewer="camera-author";
await request("profile/nickname","PUT",{nickname:"Camera_Author"});
const cameraEntry=await request(reactionBase+"/entries","POST",entry("On-site photograph"));
assert.equal(cameraEntry.status,201);
const reactionId=cameraEntry.data.id;
const likes=reactionBase+"/votes/"+reactionId;
const dislikes=reactionBase+"/dislikes/"+reactionId;
const comments="entries/"+reactionId+"/comments";
const reactionState="state?round="+reactionRound;
assert.equal((await request(dislikes,"PUT")).status,403); // own negative reaction
viewer=null;
assert.equal((await request(dislikes,"PUT")).status,401);
assert.equal((await request(comments,"POST",{text:"Anonymous"})).status,404);
assert.equal((await request(comments)).status,404);
viewer="new-reactor";
assert.equal((await request(comments,"POST",{text:"No nickname"})).status,404);
await request("profile/nickname","PUT",{nickname:"Reaction_Driver"});
sql.prepare("INSERT INTO comments(id,entry_id,author,body,created) VALUES(?,?,?,?,?)").run("legacy-comment",reactionId,"site:new-reactor","Historical comment hidden from all application surfaces",seconds);
for(const method of ["GET","POST","PUT","DELETE"]) {
  assert.equal((await request(comments,method,method==="GET"?undefined:{text:"Must not be stored"})).status,404);
}
assert.equal(sql.prepare("SELECT count(*) n FROM comments").get().n,1);
assert.equal("comments" in (await request(reactionState)).data.entries[0],false);
viewer="owner";
const withoutComments=(await request("admin/rounds/"+reactionRound)).data;
assert.equal("comments" in withoutComments,false);
assert.equal("comments" in withoutComments.next,false);
assert.equal("comments" in (await request("admin/overview")).data.summary,false);
assert.equal((await request("admin/rounds/"+reactionRound+"/comments/legacy-comment","POST",{hidden:false})).status,404);
viewer="new-reactor";
assert.equal((await request(likes,"PUT")).status,200);
let reaction=(await request(reactionState)).data.entries[0];
assert.deepEqual([reaction.likes,reaction.dislikes,reaction.liked,reaction.disliked],[1,0,true,false]);
assert.equal((await request(dislikes,"PUT")).status,200);
assert.equal((await request(dislikes,"PUT")).status,200);
reaction=(await request(reactionState)).data.entries[0];
assert.deepEqual([reaction.likes,reaction.dislikes,reaction.liked,reaction.disliked],[0,1,false,true]);
await request(likes,"DELETE"); // a delayed removal of a like must not remove a newer dislike
assert.equal((await request(reactionState)).data.entries[0].dislikes,1);
await request(dislikes,"DELETE");
assert.equal((await request(reactionState)).data.entries[0].dislikes,0);
await request(likes,"PUT");
await request(dislikes,"DELETE");
assert.equal((await request(reactionState)).data.entries[0].likes,1);
await Promise.all(Array.from({length:6},(_,i)=>request(i%2?likes:dislikes,"PUT")));
assert.equal(sql.prepare("SELECT count(*) n FROM votes WHERE voter='site:new-reactor' AND entry_id=?").get(reactionId).n,1);
await request(dislikes,"PUT");
viewer="owner";
assert.equal((await request("admin/rounds/"+reactionRound)).data.entries[0].dislikes,1);
assert((await request("admin/rounds/"+reactionRound)).data.voteActivity.some(e=>e.action==="dislike_added"));
// A round containing only dislikes has no winner. The deadline blocks either reaction.
const reactionCutoff=(await request(reactionState)).data.round.closes;
seconds=reactionCutoff;
viewer="new-reactor";
assert.equal((await request(likes,"PUT")).status,409);
assert.equal((await request(dislikes,"DELETE")).status,409);
assert.equal((await request(reactionState)).data.winner,null);
assert.equal((await request("winners")).data.rounds.find(r=>r.id===reactionRound).winner,null);
// Standalone deploys must ignore forged Sites identity headers.
const standaloneEnv=globalThis.__tuneArenaFixture.env;
standaloneEnv.TRUST_SITE_AUTH="0";
viewer="owner";
assert.equal((await request("state")).data.signedIn,false);
assert.equal((await request("admin/overview")).status,401);
standaloneEnv.ENVIRONMENT="production";standaloneEnv.LOCAL_DEV_AUTH="1";standaloneEnv.LOCAL_DEV_ADMIN="1";
assert.equal((await request("auth/dev","POST")).status,404);
standaloneEnv.ENVIRONMENT="development";standaloneEnv.APP_ORIGIN="http://localhost:5173";
async function localRequest(path,method="GET",cookie=""){
 const response=await routes[method](new Request("http://localhost:5173/api/"+path,{method,headers:{Origin:"http://localhost:5173",Cookie:cookie}}));
 return {status:response.status,data:await response.json().catch(()=>null),cookie:response.headers.get("set-cookie")};
}
const demo=await localRequest("auth/dev","POST");
assert.equal(demo.status,303);assert.match(demo.cookie,/HttpOnly/);assert(!demo.cookie.includes("Secure;"));
const demoCookie=demo.cookie.match(/ta_session=[^;]+/)[0];
assert.equal((await localRequest("state","GET",demoCookie)).data.admin,true);
standaloneEnv.LOCAL_DEV_ADMIN="0";
assert.equal((await localRequest("state","GET",demoCookie)).data.admin,false);
const localUser=sql.prepare("SELECT user_id FROM identities WHERE provider='dev'").get().user_id;
const emailKey=Buffer.from(await crypto.subtle.digest("SHA-256",new TextEncoder().encode("email:owner@example.invalid"))).toString("base64url");
sql.prepare("INSERT INTO identities(provider,subject,user_id) VALUES('email',?,?)").run(emailKey,localUser);
assert.equal((await localRequest("state","GET",demoCookie)).data.admin,true);
await localRequest("auth/logout","POST",demoCookie);
assert.equal((await localRequest("state","GET",demoCookie)).data.signedIn,false);
console.log("PASS: standalone ignores platform headers, production disables demo sign-in, local login/logout, explicit demo administrator and verified email administrator.");
sql.close();

console.log("PASS: role separation, vote changes and audit, exact cutoff, automatic tie result, idempotent organizer announcement, empty and private test rounds.");
console.log("PASS: referrals through cookies, self/existing/invalid invites, one-time 3-day welcome, real activity thresholds, test/toggle/inviter exclusions, 3/6-friend stacking, concurrent reward retries, acknowledgement, CSRF and expiration.");
console.log("PASS: upload storage, comment endpoints disabled for guests and signed-in accounts, legacy comments not exposed, mutually exclusive like/dislike, retry and delayed-delete safety, concurrent switching, admin counts, dislike-only no-winner, deadline locks and no referral reward for dislikes.");
