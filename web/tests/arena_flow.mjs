/*
 * Runs the production route handlers with a SQLite D1 adapter, in-memory R2,
 * fixture identities, and a controllable database clock.
 * Run from the project root with: node tests/arena_flow.mjs
 */
import assert from "node:assert/strict";
import {createHmac,createHash} from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { build } from "esbuild";

let seconds=1800000000;
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
    TRUST_SITE_AUTH:"1",
    TUNE_ADMIN_EMAIL:"owner@example.invalid",
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
  return {status:response.status,data:await response.json(),cookie:response.headers.get("set-cookie")};
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
viewer="";
const publicFeed=await request("state");
assert.equal(publicFeed.data.round.id,round);
assert.equal(publicFeed.data.signedIn,false);
viewer="owner";
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
viewer="";
const publicPhotos=(await request("state")).data;
assert.equal(publicPhotos.entries[0].id,first.data.id);
assert.equal(publicPhotos.entries[0].sample,false);
assert.equal(publicPhotos.entries[0].image,"/api/media/"+first.data.id);
assert.equal(publicPhotos.myEntry,null);
viewer="participant-a";
const garageEntry=(await request(state)).data.myEntry;
assert.equal(garageEntry.id,first.data.id);assert.equal(garageEntry.likes,0);assert.equal(garageEntry.rank,1);
assert.equal(garageEntry.image,"/api/media/"+first.data.id);
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
assert(result.data.rounds.every(r=>r.closedAt<=seconds&&r.kind==="weekly"));
assert.deepEqual(result.data.rounds.map(r=>r.closedAt),result.data.rounds.map(r=>r.closedAt).toSorted((a,b)=>b-a));
assert.equal(result.status,200);
assert.equal(result.data.rounds[0].winner.id,first.data.id);
assert.equal(result.data.rounds[0].winner.votes,1);
assert.deepEqual(result.data.rounds[0].podium.popular.map(e=>[e.id,e.place,e.points]),[[first.data.id,1,1],[second.data.id,2,1]]);
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
assert(!(await request("winners")).data.rounds.some(item=>item.id===ownTest));
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
for(const id of ten) assert.equal((await request(referralBase+"/dislikes/"+id,"PUT")).status,404);
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
assert.equal((await request(dislikes,"PUT")).status,404); // feature removed, including for own entries
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
// Neither PUT nor DELETE can mutate votes through the removed endpoint.
for(const method of ['PUT','DELETE'])assert.equal((await request(dislikes,method)).status,404);
assert.deepEqual((await request(reactionState)).data.entries.map(e=>[e.likes,e.dislikes,e.liked,e.disliked]),[[1,0,true,false]]);
await request(likes,'DELETE');await request(likes,'DELETE');
assert.equal((await request(reactionState)).data.entries[0].likes,0);
await Promise.all(Array.from({length:6},()=>request(likes,'PUT')));
assert.equal(sql.prepare("SELECT count(*) n FROM votes WHERE voter='site:new-reactor' AND entry_id=?").get(reactionId).n,1);
await request(likes,'DELETE');
// Legacy negative votes never affect the podium or create a winner.
sql.prepare('INSERT INTO votes(entry_id,voter,created,value) VALUES(?,?,?,-1)').run(reactionId,'legacy-negative',seconds);
const reactionCutoff=(await request(reactionState)).data.round.closes;
seconds=reactionCutoff;
assert.equal((await request(likes,'PUT')).status,409);
assert.equal((await request(dislikes,'DELETE')).status,404);
assert.equal((await request(reactionState)).data.winner,null);
const negativeOutcome=(await request('winners')).data.rounds.find(r=>r.id===reactionRound);
assert.equal(negativeOutcome.winner,null);assert.equal(negativeOutcome.podium.popular.length,0);



console.log("PASS: role separation, vote changes and audit, exact cutoff, automatic tie result, idempotent organizer announcement, empty and private test rounds.");
console.log("PASS: referrals through cookies, self/existing/invalid invites, one-time 3-day welcome, real activity thresholds, test/toggle/inviter exclusions, 3/6-friend stacking, concurrent reward retries, acknowledgement, CSRF and expiration.");
console.log("PASS: upload storage, comment endpoints disabled for guests and signed-in accounts, legacy comments not exposed, removed dislike endpoints, idempotent likes, concurrent retries, legacy negative votes excluded from winners, deadline locks and no referral reward for dislikes.");

// Charged Garage: production routes, transactional spend limit and dual awards.
viewer='owner';
const charged=await createRound('Charged Garage integration');
const chargedBase='rounds/'+charged;
for(const [id,author] of [['heart-car','heart-author'],['motor-car','motor-author']]) {
 sql.prepare("INSERT INTO profiles(id,nickname) VALUES(?,?)").run('site:'+author,author);
 sql.prepare("INSERT INTO entries(id,round_id,owner,name,description,media,created) VALUES(?,?,?,?,?,?,?)")
 .run(id,charged,'site:'+author,id,'Fixture','entries/fixture',seconds);
}
for(const driver of ['motor-driver','motor-other']) sql.prepare("INSERT INTO profiles(id,premium_until) VALUES(?,?)").run('site:'+driver,seconds+500);
viewer='regular-driver';
assert.equal((await request(chargedBase+'/motors/motor-car','PUT')).status,403);
viewer='motor-author';
sql.prepare("UPDATE profiles SET premium_until=? WHERE id=?").run(seconds+500,'site:motor-author');
assert.equal((await request(chargedBase+'/motors/motor-car','PUT')).data.error,'own_entry');
viewer='motor-driver';
const spend=await Promise.all(['motor-car','heart-car','motor-car','heart-car'].map(id=>request(chargedBase+'/motors/'+id,'PUT')));
assert.equal(sql.prepare('SELECT count(*) n FROM motors WHERE round_id=? AND voter=?').get(charged,'site:motor-driver').n,1);
assert.equal(spend.filter(x=>x.status===200).length,2);
assert.equal((await request(chargedBase+'/motors/motor-car','DELETE')).status,404);
assert.equal((await request(chargedBase+'/motors/motor-car','PUT')).status,200);
assert.equal((await request(chargedBase+'/motors/heart-car','PUT')).data.error,'motor_spent');
assert.equal((await request('state?round='+charged)).data.motor.available,false);
for(const voter of ['h1','h2']) {viewer=voter;assert.equal((await request(chargedBase+'/votes/heart-car','PUT')).status,200);}
viewer='motor-other';
const hiddenCar=sql.prepare("UPDATE entries SET hidden=1 WHERE id='heart-car'").run();
assert.equal((await request(chargedBase+'/motors/heart-car','PUT')).status,404);
sql.prepare("UPDATE entries SET hidden=0 WHERE id='heart-car'").run();
const activeState=(await request('state?round='+charged)).data;
assert.equal(activeState.entries.find(e=>e.id==='motor-car').score,5);
assert.equal(activeState.entries.find(e=>e.id==='heart-car').likes,2);
const chargedCutoff=activeState.round.closes;
// Extend an active membership at its end, clamping Jan 31 to February's last day.
const jan31=Math.floor(Date.UTC(2028,0,31,13,14,15)/1000);
sql.prepare("UPDATE profiles SET premium_until=? WHERE id='site:heart-author'").run(jan31);
seconds=chargedCutoff;
assert.equal((await request(chargedBase+'/motors/heart-car','PUT')).data.error,'closed');
const closedCharged=(await request('state?round='+charged)).data;
assert.equal(closedCharged.winner.id,'heart-car');
assert.equal(closedCharged.overallWinner.id,'motor-car');
assert.equal(closedCharged.overallWinner.score,5);
const feb29=Math.floor(Date.UTC(2028,1,29,13,14,15)/1000);
assert.equal(sql.prepare("SELECT premium_until FROM profiles WHERE id='site:heart-author'").get().premium_until,feb29);
await Promise.all(Array.from({length:8},()=>request('winners')));
assert.equal(sql.prepare('SELECT count(*) n FROM round_awards WHERE round_id=?').get(charged).n,1);
assert.equal(sql.prepare("SELECT premium_until FROM profiles WHERE id='site:heart-author'").get().premium_until,feb29);
viewer='motor-author';
assert.equal((await request('state')).data.profile.championTitles,1);
const archived=(await request('winners')).data.rounds.find(r=>r.id===charged);
assert.equal(archived.rewardGranted,true);assert.equal(archived.overallWinner.id,'motor-car');
viewer='owner';
const secondCharged=await createRound('Motor only');
sql.prepare("INSERT INTO entries(id,round_id,owner,name,description,media,created) VALUES('motor-only',?,'site:motor-author','Motor only','Fixture','entries/fixture',?)").run(secondCharged,seconds);
viewer='motor-driver';
assert.equal((await request('state?round='+secondCharged)).data.motor.available,true);
assert.equal((await request('rounds/'+secondCharged+'/motors/motor-only','PUT')).status,200);
seconds+=60;
const motorOnly=(await request('state?round='+secondCharged)).data;
assert.equal(motorOnly.winner,null);assert.equal(motorOnly.overallWinner.id,'motor-only');
viewer='owner';
assert.equal((await request('admin/rounds/'+secondCharged+'/announce','POST')).status,200);
assert((await request('admin/rounds/'+charged)).data.voteActivity.some(e=>e.action==='motor_added'));
viewer='motor-driver';
sql.prepare("UPDATE profiles SET premium_until=? WHERE id='site:motor-driver'").run(seconds);
const trialRound=await request('rounds','POST',{kind:'test'});
assert.equal((await request('rounds/'+trialRound.data.id+'/motors/night-'+trialRound.data.id,'PUT')).data.error,'premium_required');
sql.prepare("UPDATE profiles SET premium_until=? WHERE id='site:motor-driver'").run(seconds+500);
assert.equal((await request('rounds/'+trialRound.data.id+'/votes/night-'+trialRound.data.id,'PUT')).status,200);
const prior=sql.prepare("SELECT premium_until FROM profiles WHERE id='sample:night'").get();
seconds+=60;await request('winners');
assert.deepEqual(sql.prepare("SELECT premium_until FROM profiles WHERE id='sample:night'").get(),prior);
console.log('PASS: one Motor per round under concurrent retries, no transfer/refund, Premium expiry, self/hidden/deadline restrictions, independent heart and weighted outcomes, motor-only winner, persisted champion, audit, calendar-month clamping, idempotent prize extension and no test-round rewards.');



// Premium replacement/withdrawal: real production API and transactional failure paths.
viewer='owner';
const replaceRound=await createRound('Replacement integration');
const replaceBase='rounds/'+replaceRound;
sql.prepare('UPDATE rounds SET submission_closes=? WHERE id=?').run(seconds+40,replaceRound);
viewer='replace-driver';await request('profile/nickname','PUT',{nickname:'Replace_Driver'});
const original=await request(replaceBase+'/entries','POST',entry('Original'));
assert.equal(original.status,201);
let currentId=original.data.id;
function replacementForm(name){const form=entry(name);form.set('resetConsent','yes');return form;}
assert.equal((await request(replaceBase+'/entries/'+currentId,'PUT',replacementForm('Forbidden'))).data.error,'premium_required');
assert.equal((await request(replaceBase+'/entries/'+currentId,'DELETE')).data.error,'premium_required');
assert.equal((await request(replaceBase+'/entries','POST',entry('Duplicate'))).data.error,'entry_exists');
sql.prepare("UPDATE profiles SET premium_until=? WHERE id='site:replace-driver'").run(seconds+500);
viewer='replace-fan';assert.equal((await request(replaceBase+'/votes/'+currentId,'PUT')).status,200);
viewer='replace-critic';assert.equal((await request(replaceBase+'/dislikes/'+currentId,'PUT')).status,404);
sql.prepare('INSERT INTO votes(entry_id,voter,created,value) VALUES(?,?,?,-1)').run(currentId,'legacy-replace-critic',seconds);
viewer='replace-motor';await request('profile/nickname','PUT',{nickname:'Replace_Motor'});
sql.prepare("UPDATE profiles SET premium_until=? WHERE id='site:replace-motor'").run(seconds+500);
assert.equal((await request(replaceBase+'/motors/'+currentId,'PUT')).status,200);
viewer='foreign-premium';await request('profile/nickname','PUT',{nickname:'Foreign_Premium'});await request('premium','POST');
assert.equal((await request(replaceBase+'/entries/'+currentId,'PUT',replacementForm('Stolen'))).status,404);
assert.equal((await request(replaceBase+'/entries/'+currentId,'DELETE')).status,404);
viewer='replace-driver';
assert.equal((await request(replaceBase+'/entries/'+currentId,'PUT',entry('Missing consent'))).status,400);
const invalidReplacement=replacementForm('Invalid');invalidReplacement.set('photo',new Blob(['invalid']),'invalid.jpg');
assert.equal((await request(replaceBase+'/entries/'+currentId,'PUT',invalidReplacement)).status,400);
const untouched=(await request('state?round='+replaceRound)).data.entries.find(e=>e.id===currentId);
assert.equal(untouched.likes,1);assert.equal(untouched.dislikes,1);assert.equal(untouched.score,6);
const beforeRollback=uploads.size;
sql.exec("CREATE TEMP TRIGGER fail_replacement BEFORE INSERT ON entries WHEN NEW.name='DB failure' BEGIN SELECT RAISE(ABORT,'fixture rollback'); END;");
const failed=await request(replaceBase+'/entries/'+currentId,'PUT',replacementForm('DB failure'));
sql.exec('DROP TRIGGER fail_replacement');
assert.equal(failed.status,500);assert.equal(uploads.size,beforeRollback);
assert.equal(sql.prepare('SELECT withdrawn FROM entries WHERE id=?').get(currentId).withdrawn,0);
assert.equal(sql.prepare('SELECT count(*) n FROM votes WHERE entry_id=?').get(currentId).n,2);
sql.prepare('UPDATE entries SET hidden=1 WHERE id=?').run(currentId);
assert.equal((await request(replaceBase+'/entries/'+currentId,'PUT',replacementForm('Moderation bypass'))).status,404);
assert.equal((await request(replaceBase+'/entries/'+currentId,'DELETE')).status,404);
sql.prepare('UPDATE entries SET hidden=0 WHERE id=?').run(currentId);
const next=await request(replaceBase+'/entries/'+currentId,'PUT',replacementForm('New build'));
assert.equal(next.status,201);assert.notEqual(next.data.id,currentId);
const retired=currentId;currentId=next.data.id;
let replacementState=(await request('state?round='+replaceRound)).data;
assert(!replacementState.entries.some(e=>e.id===retired));assert.equal(replacementState.myEntry.id,currentId);
let currentBuild=replacementState.entries.find(e=>e.id===currentId);
assert.equal(currentBuild.likes,0);assert.equal(currentBuild.dislikes,0);assert.equal(currentBuild.motors,0);assert.equal(currentBuild.score,0);
assert.equal(sql.prepare('SELECT count(*) n FROM votes WHERE entry_id=?').get(retired).n,0);
assert.equal(sql.prepare('SELECT count(*) n FROM motors WHERE entry_id=?').get(retired).n,1);
viewer='replace-fan';
assert.equal((await request(replaceBase+'/votes/'+retired,'PUT')).status,404);
assert.equal((await request('media/'+retired)).status,404);
viewer='replace-motor';assert.equal((await request(replaceBase+'/motors/'+currentId,'PUT')).data.error,'motor_spent');
viewer='replace-driver';
const racing=await Promise.all(['Race one','Race two'].map(name=>request(replaceBase+'/entries/'+currentId,'PUT',replacementForm(name))));
assert.equal(racing.filter(r=>r.status===201).length,1);
assert(racing.filter(r=>r.status!==201).every(r=>[404,409].includes(r.status)));
currentId=racing.find(r=>r.status===201).data.id;
assert.equal(sql.prepare('SELECT count(*) n FROM entries WHERE round_id=? AND withdrawn=0').get(replaceRound).n,1);
assert.equal((await request(replaceBase+'/entries/'+currentId,'DELETE')).status,200);
assert.equal((await request(replaceBase+'/entries/'+currentId,'DELETE')).status,200);
replacementState=(await request('state?round='+replaceRound)).data;
assert.equal(replacementState.entries.length,0);assert.equal(replacementState.myEntry.withdrawn,1);
assert.equal((await request(replaceBase+'/entries','POST',entry('Bypass'))).data.error,'entry_exists');
sql.prepare("UPDATE profiles SET premium_until=? WHERE id='site:replace-driver'").run(seconds);
assert.equal((await request(replaceBase+'/entries/'+currentId,'PUT',replacementForm('Expired'))).data.error,'premium_required');
sql.prepare("UPDATE profiles SET premium_until=? WHERE id='site:replace-driver'").run(seconds+500);
const restored=await request(replaceBase+'/entries/'+currentId,'PUT',replacementForm('Restored'));
assert.equal(restored.status,201);currentId=restored.data.id;
const uploadCount=uploads.size;
const put=globalThis.__tuneArenaFixture.env.BUCKET.put;
globalThis.__tuneArenaFixture.env.BUCKET.put=async(...args)=>{await put(...args);seconds+=40;};
const late=await request(replaceBase+'/entries/'+currentId,'PUT',replacementForm('Too late'));
globalThis.__tuneArenaFixture.env.BUCKET.put=put;
assert.equal(late.data.error,'submissions_closed');assert.equal(uploads.size,uploadCount);
assert.equal((await request('state?round='+replaceRound)).data.myEntry.id,currentId);
assert.equal((await request(replaceBase+'/entries/'+currentId,'DELETE')).data.error,'submissions_closed');
viewer='fresh-late-driver';await request('profile/nickname','PUT',{nickname:'Fresh_Late_Driver'});
assert.equal((await request(replaceBase+'/entries','POST',entry('New late entry'))).data.error,'submissions_closed');
viewer='replace-fan';assert.equal((await request(replaceBase+'/votes/'+currentId,'PUT')).status,200);
const postDeadline=(await request('state?round='+replaceRound)).data;
assert.equal(postDeadline.round.closed,false);assert.equal(postDeadline.round.submissionsClosed,true);
seconds+=20;
const replacementFinal=(await request('state?round='+replaceRound)).data;
assert.equal(replacementFinal.winner.id,currentId);assert.equal(replacementFinal.overallWinner.id,currentId);
viewer='owner';const audited=(await request('admin/rounds/'+replaceRound)).data;
assert(audited.events.some(e=>e.action==='entry_replaced'));
assert.equal(audited.events.filter(e=>e.action==='entry_withdrawn').length,1);
assert(audited.entries.some(e=>e.withdrawn&&e.superseded_by));
assert.equal((await request('admin/rounds','POST',{title:'Invalid deadline',notice:'',prize:'',minutes:1,submissionDeadline:'2026-02-31T20:00'})).data.error,'invalid_deadline');
console.log('PASS: Premium-only replace/withdraw, fixed ordinary slot, ownership, moderation, consent, score reset, no Motor refund, stale votes, concurrent requests, transaction rollback, staged-image cleanup, expiry, separate deadlines, winner integrity and audit.');


// Commercial modules use production handlers and actual DB triggers; no live payments.
const fixtureEnv=globalThis.__tuneArenaFixture.env;
viewer='owner';
assert.equal((await request('admin/commerce/settings','POST',{seller:'Fixture merchant (tests only)'})).status,200);
async function product(kind,extra={}){const p=await request('admin/commerce/products','POST',{name:'Fixture '+kind,kind,description:'Fixture',image:'',variant:'',amount:1200,currency:'eur',stock:-1,duration:86400,shippingMinor:0,terms:'Fixture terms',active:true,...extra});assert.equal(p.status,200);return p.data.id;}
const premiumSku=await product('premium');const merchSku=await product('merch',{stock:1,shippingMinor:200});
viewer='commercial-buyer';await request('profile/nickname','PUT',{nickname:'Commercial_Buyer'});
assert.equal((await request('admin/commerce/products','POST',{})).status,403);
const key=crypto.randomUUID();
let bought=await request('commerce/orders','POST',{productId:premiumSku,requestKey:key,method:'invoice',quantity:1,amount:1});assert.equal(bought.status,201);
const invoice=bought.data.order;assert.equal(invoice.amount,1200);
assert.equal((await request('commerce/orders','POST',{productId:premiumSku,requestKey:key,method:'invoice',quantity:1})).data.order.id,invoice.id);
assert.equal((await request('commerce/orders','POST',{productId:premiumSku,requestKey:key,method:'invoice',quantity:2})).status,409);
assert.equal((await request('admin/commerce/orders/'+invoice.id+'/confirm','POST',{reference:'fake'})).status,403);
viewer='owner';
const beforePremium=sql.prepare("SELECT premium_until FROM profiles WHERE id='site:commercial-buyer'").get().premium_until;
assert.equal((await request('admin/commerce/orders/'+invoice.id+'/confirm','POST',{reference:'Fixture bank statement 1'})).status,200);
assert.equal((await request('admin/commerce/orders/'+invoice.id+'/confirm','POST',{reference:'Fixture bank statement 1'})).status,409);
assert.equal(sql.prepare("SELECT premium_until FROM profiles WHERE id='site:commercial-buyer'").get().premium_until,Math.max(beforePremium,seconds)+86400);
assert.equal(sql.prepare('SELECT count(*) n FROM commerce_entitlements WHERE order_id=?').get(invoice.id).n,1);
viewer='commercial-buyer';
assert.equal((await request('commerce/orders','POST',{productId:merchSku,requestKey:crypto.randomUUID(),method:'invoice'})).data.error,'shipping_required');
const stockRace=await Promise.all(Array.from({length:3},()=>request('commerce/orders','POST',{productId:merchSku,requestKey:crypto.randomUUID(),method:'invoice',quantity:1,shippingAddress:'Fixture test address'})));
assert.equal(stockRace.filter(v=>v.status===201).length,1);assert.equal(sql.prepare('SELECT stock FROM products WHERE id=?').get(merchSku).stock,0);
const merchOrder=stockRace.find(v=>v.status===201).data.order;
assert(!(await request('commerce/catalog')).data.orders.some(o=>'address'in o));
viewer='unrelated-buyer';
assert.equal((await request('commerce/orders/'+merchOrder.id+'/cancel','POST')).status,404);
assert.equal((await request('admin/commerce/orders/'+merchOrder.id)).status,403);
viewer='commercial-buyer';await request('commerce/orders/'+merchOrder.id+'/cancel','POST');await request('commerce/orders/'+merchOrder.id+'/cancel','POST');
assert.equal(sql.prepare('SELECT stock FROM products WHERE id=?').get(merchSku).stock,1);
const expiry=await request('commerce/orders','POST',{productId:merchSku,requestKey:crypto.randomUUID(),method:'invoice',shippingAddress:'Fixture address'});
sql.prepare('UPDATE commerce_orders SET expires=? WHERE id=?').run(seconds,expiry.data.order.id);await request('commerce/catalog');await request('commerce/catalog');
assert.equal(sql.prepare('SELECT stock FROM products WHERE id=?').get(merchSku).stock,1);
viewer='owner';
assert.equal((await request('admin/sponsors/brands','POST',{name:'Bad',category:'Fixture',logo:'javascript:alert(1)',website:''})).status,400);
const brand=await request('admin/sponsors/brands','POST',{name:'Fixture Brand',category:'Автохимия',logo:'https://example.invalid/logo.png',website:'https://example.invalid'});
const campaignBody={sponsorId:brand.data.id,roundId:'',period:'week',title:'Fixture campaign',starts:seconds-1,ends:seconds+1000,state:'active',link:'https://example.invalid/offer',promo:'FIXTURE',prize:'Fixture service',prizeState:'committed',prizeReference:'Fixture agreement',feeMinor:1000,currency:'eur',confirmed:false};
assert.equal((await request('admin/sponsors/campaigns','POST',campaignBody)).status,409);
const campaign=await request('admin/sponsors/campaigns','POST',{...campaignBody,confirmed:true});assert.equal(campaign.status,200);
assert.equal((await request('sponsors')).data.campaigns[0].brand,'Fixture Brand');
await request('admin/sponsors/posts','POST',{campaignId:campaign.data.id,title:'Care guide',body:'Fixture sponsored text',image:'',video:'https://example.invalid/video',published:true});
assert.equal((await request('sponsors')).data.posts.length,1);
const eventId=crypto.randomUUID();await Promise.all(Array.from({length:4},()=>request('sponsors/'+campaign.data.id+'/impression','POST',{eventId})));
assert.equal(sql.prepare('SELECT count(*) n FROM sponsor_events WHERE campaign_id=?').get(campaign.data.id).n,1);
viewer='';assert.equal((await request('partners/leads','POST',{brand:'Fixture',category:'Fixture',contact:'test',offer:'Fixture'})).status,401);
viewer='commercial-buyer';assert.equal((await request('partners/leads','POST',{brand:'Fixture',category:'Fixture',contact:'fixture@example.invalid',offer:'Fixture'})).status,201);
assert(!JSON.stringify((await request('sponsors')).data).includes('fixture@example.invalid'));
// Paid retries always return to moderation, and a consumed right cannot be reused.
viewer='owner';const retryRound=await createRound('Paid retry');const retryBase='rounds/'+retryRound;
const retrySku=await product('retry');const pinSku=await product('pin');const prioritySku=await product('priority');const slotSku=await product('slot');
viewer='retry-buyer';await request('profile/nickname','PUT',{nickname:'Retry_Buyer'});
const rejected=(await request(retryBase+'/entries','POST',entry('Rejected build'))).data.id;
viewer='owner';assert.equal((await request('admin/moderation/'+rejected,'POST',{decision:'rejected',reason:'Fixture moderation reason'})).status,200);
viewer='retry-buyer';
const retryOrder=(await request('commerce/orders','POST',{productId:retrySku,entryId:rejected,requestKey:crypto.randomUUID(),method:'invoice'})).data.order;
const retryForm=replacementForm('Revision');retryForm.set('retryOrder',retryOrder.id);
assert([403,404,409].includes((await request('rounds/'+retryRound+'/retry/'+rejected,'PUT',retryForm)).status));
viewer='owner';assert.equal((await request('admin/commerce/orders/'+retryOrder.id+'/confirm','POST',{reference:'Fixture paid retry'})).status,200);
viewer='retry-buyer';const retryResult=await request('rounds/'+retryRound+'/retry/'+rejected,'PUT',retryForm);assert.equal(retryResult.status,201);
assert.equal((await request('state?round='+retryRound)).data.entries.length,0);
assert.equal((await request('state?round='+retryRound)).data.myEntry.moderation_state,'pending');
const pendingGarage=(await request('state?round='+retryRound)).data.myEntry;
assert.equal(pendingGarage.rank,null);assert.equal(pendingGarage.likes,0);
assert.equal((await routes.GET(new Request(origin+'/api/media/'+retryResult.data.id))).status,200);
viewer='replace-critic';assert.equal((await request('media/'+retryResult.data.id)).status,404);
assert.equal((await request('state?round='+retryRound)).data.myEntry,null);
viewer='';assert.equal((await request('media/'+retryResult.data.id)).status,404);
viewer='owner';await request('admin/moderation/'+retryResult.data.id,'POST',{decision:'approved',reason:'Fixture accepted'});
viewer='retry-buyer';assert.equal((await request('state?round='+retryRound)).data.entries[0].likes,0);
const pinOrder=(await request('commerce/orders','POST',{productId:pinSku,entryId:retryResult.data.id,requestKey:crypto.randomUUID(),method:'invoice'})).data.order;
viewer='owner';await request('admin/commerce/orders/'+pinOrder.id+'/confirm','POST',{reference:'Fixture pin payment'});
assert.equal((await request('promotions?round='+retryRound)).data.entries[0].id,retryResult.data.id);
assert.equal((await request('state?round='+retryRound)).data.entries[0].score,0);
viewer='retry-buyer';await request('commerce/orders/'+pinOrder.id+'/refund','POST',{reason:'Fixture cancellation'});
assert.equal((await request('promotions?round='+retryRound)).data.entries.length,0);
// A verified Stripe webhook, not the browser return URL, grants the purchase.
fixtureEnv.STRIPE_SECRET_KEY='sk_test_fixture';fixtureEnv.STRIPE_WEBHOOK_SECRET='whsec_fixture';
const originalFetch=globalThis.fetch;const sessions=new Map();let sessionSerial=0;
globalThis.fetch=async(url,options={})=>{
 assert(String(url).startsWith('https://api.stripe.com/v1/'));
 if(options.method==='POST'&&String(url).endsWith('/checkout/sessions')){const b=new URLSearchParams(options.body),id='cs_fixture_'+(++sessionSerial);const v={id,url:'https://checkout.stripe.com/fixture',status:'open',payment_status:'unpaid',amount_total:Number(b.get('line_items[0][price_data][unit_amount]')),currency:b.get('line_items[0][price_data][currency]'),client_reference_id:b.get('client_reference_id'),metadata:{order_id:b.get('metadata[order_id]')},payment_intent:'pi_fixture_'+sessionSerial};sessions.set(id,v);return Response.json(v);}
 const id=String(url).split('/').at(-1);if(sessions.has(id))return Response.json(sessions.get(id));
 if(String(url).endsWith('/refunds'))return Response.json({status:'succeeded'});
 throw new Error('Unexpected fixture Stripe request');
};
viewer='stripe-buyer';await request('profile/nickname','PUT',{nickname:'Stripe_Buyer'});
const cardOrder=(await request('commerce/orders','POST',{productId:premiumSku,requestKey:crypto.randomUUID(),method:'stripe'})).data.order;
assert.equal((await request('commerce/orders/'+cardOrder.id+'/checkout','POST')).status,200);
assert.equal((await request('state')).data.profile.premium,false);
const session=[...sessions.values()][0];session.payment_status='paid';session.status='complete';
async function webhook(event,valid=true){const raw=JSON.stringify(event),t=String(Math.floor(Date.now()/1000));const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(fixtureEnv.STRIPE_WEBHOOK_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);const sig=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(t+'.'+raw))),x=>x.toString(16).padStart(2,'0')).join('');return request('payments/webhook','POST',event,{'stripe-signature':'t='+t+',v1='+(valid?sig:'0'.repeat(64))});}
const paidEvent={id:'evt_fixture_payment',type:'checkout.session.completed',data:{object:{id:session.id}}};
assert.equal((await webhook(paidEvent,false)).status,400);
session.amount_total=1;assert.equal((await webhook(paidEvent)).status,409);session.amount_total=1200;
assert.equal((await webhook(paidEvent)).status,200);
const paidUntil=(await request('state')).data.profile.premiumUntil;
await Promise.all(Array.from({length:4},()=>webhook(paidEvent)));
assert.equal((await request('state')).data.profile.premiumUntil,paidUntil);
assert.equal(sql.prepare('SELECT count(*) n FROM commerce_entitlements WHERE order_id=?').get(cardOrder.id).n,1);
globalThis.fetch=originalFetch;
// Trophies are immutable per result/category; public metadata excludes account and wallet.
viewer='replace-driver';const trophies=(await request('trophies')).data.trophies;assert(trophies.length>=2);const trophy=trophies[0];
assert.equal((await request('trophies')).data.trophies.length,trophies.length);
const pub=(await request('trophies/'+trophy.code)).data;assert(!('owner'in pub));
assert.equal((await request('trophies/'+trophy.code+'/wallet','POST',{wallet:'0x'+'1'.repeat(40),consent:true})).status,200);
const metadata=(await request('trophies/'+trophy.code+'/metadata')).data;assert(!JSON.stringify(metadata).includes('0x'+'1'.repeat(40)));
viewer='owner';assert.equal((await request('trophies/'+trophy.code+'/mint-intent','POST',{})).status,503);
assert.equal((await request('trophies/'+trophy.code+'/revoke','POST',{reason:'Fixture correction'})).status,200);
assert.equal((await request('trophies/'+trophy.code)).data.revoked,1);
console.log('PASS: commerce permissions, server prices, idempotency, stock contention/cancel/expiry, shipping privacy, sponsor confirmation and safe URLs, deduplicated metrics, leads, paid retry moderation, promotion score isolation, refunds, Stripe signature/amount/replay checks, trophy uniqueness and privacy.');

// Verify the NFT transaction intent and actual EVM log decoding using a fixture RPC.
const nftTrophy=trophies.find(t=>t.code!==trophy.code);
viewer='replace-driver';
const wallet='0x'+'3'.repeat(40);
assert.equal((await request('trophies/'+nftTrophy.code+'/wallet','POST',{wallet,consent:true})).status,200);
fixtureEnv.NFT_RPC_URL='https://rpc.example.invalid';fixtureEnv.NFT_CONTRACT='0x'+'2'.repeat(40);fixtureEnv.NFT_CHAIN_ID='31337';
viewer='owner';const intent=await request('trophies/'+nftTrophy.code+'/mint-intent','POST',{});assert.equal(intent.status,200);
const {Interface}=await import('ethers');const nftInterface=new Interface(['function award(address recipient,uint256 tokenId,string uri)','event Transfer(address indexed from,address indexed to,uint256 indexed tokenId)']);
const decoded=nftInterface.decodeFunctionData('award',intent.data.data);assert.equal(decoded[0].toLowerCase(),wallet);assert(decoded[2].endsWith('/metadata'));
const eventLog=nftInterface.encodeEventLog(nftInterface.getEvent('Transfer'),['0x'+'0'.repeat(40),wallet,decoded[1]]);
let validMint=false;
globalThis.fetch=async(url,options)=>{assert.equal(url,fixtureEnv.NFT_RPC_URL);const m=JSON.parse(options.body).method;return Response.json({result:m==='eth_chainId'?'0x7a69':m==='eth_blockNumber'?'0x4':{status:'0x1',to:fixtureEnv.NFT_CONTRACT,blockNumber:'0x1',logs:validMint?[{address:fixtureEnv.NFT_CONTRACT,...eventLog}]:[]}});};
const mintHash='0x'+'a'.repeat(64);
assert.equal((await request('trophies/'+nftTrophy.code+'/confirm-mint','POST',{txHash:mintHash})).status,409);
validMint=true;
assert.equal((await request('trophies/'+nftTrophy.code+'/confirm-mint','POST',{txHash:mintHash})).status,200);
assert.equal((await request('trophies/'+nftTrophy.code)).data.tx_hash,mintHash);
assert.equal((await request('trophies/'+nftTrophy.code+'/mint-intent','POST',{})).status,409);
globalThis.fetch=originalFetch;
console.log('PASS: NFT transaction ABI, recipient, configured chain, receipt confirmation count, rejection of missing mint logs and verified mint evidence; duplicate mint blocked.');


// Full top-three ranking: weighted category differs, hidden and late votes excluded.
viewer='owner';
sql.prepare("INSERT INTO rounds(id,owner,kind,opens,closes,submission_closes,title) VALUES('podium-check','site:owner','weekly',?,?,?,'Podium QA')").run(seconds-100,seconds-1,seconds-10);
for(let i=1;i<=4;i++) {
 sql.prepare('INSERT INTO profiles(id,nickname) VALUES(?,?)').run('podium-owner-'+i,'Podium'+i);
 sql.prepare("INSERT INTO entries(id,round_id,owner,name,description,media,created,hidden) VALUES(?,'podium-check',?,?,'Fixture','entries/fixture',?,?)").run('podium-'+i,'podium-owner-'+i,'Podium '+i,seconds-90+i,i===4?1:0);
 for(let v=0;v<(i===4?10:4-i);v++)sql.prepare('INSERT INTO votes(entry_id,voter,created,value) VALUES(?,?,?,1)').run('podium-'+i,'podium-voter-'+v,seconds-20);
}
sql.prepare("INSERT INTO votes(entry_id,voter,created,value) VALUES('podium-2','late-podium',?,1)").run(seconds);
sql.prepare("INSERT INTO motors(round_id,voter,entry_id,created) VALUES('podium-check','podium-owner-1','podium-3',?)").run(seconds-10);
const podiumResult=(await request('winners')).data.rounds.find(r=>r.id==='podium-check');
assert.deepEqual(podiumResult.podium.popular.map(e=>[e.nickname,e.place,e.points]),[['Podium1',1,3],['Podium2',2,2],['Podium3',3,1]]);
assert.deepEqual(podiumResult.podium.overall.map(e=>[e.nickname,e.place,e.points]),[['Podium3',1,6],['Podium1',2,3],['Podium2',3,2]]);
assert.equal(podiumResult.winner.id,podiumResult.podium.popular[0].id);
assert.equal(podiumResult.overallWinner.id,podiumResult.podium.overall[0].id);
assert.equal(podiumResult.closedAt,seconds-1);
console.log('PASS: top three in both categories, actual nicknames/date, weighted order, hidden entries and out-of-window votes excluded.');

// Avatar uploads: durable association, public read, ownership isolation and safe types.
viewer=null;
assert.equal((await request('profile/avatar','PUT',entry('avatar'))).status,401);
viewer='avatar-owner';
assert.equal((await request('profile/avatar','PUT',new FormData())).status,400);
const invalidAvatar=new FormData();invalidAvatar.set('photo',new Blob(['<svg onload="alert(1)"></svg>'],{type:'image/svg+xml'}),'bad.svg');
assert.equal((await request('profile/avatar','PUT',invalidAvatar)).status,400);
const savedAvatar=await request('profile/avatar','PUT',entry('avatar'));
assert.equal(savedAvatar.status,200);assert(savedAvatar.data.avatar.startsWith('/api/avatars/'));
assert.equal((await request('state')).data.profile.avatar,savedAvatar.data.avatar);
const avatarKey=savedAvatar.data.avatar.slice('/api/avatars/'.length);
assert(uploads.has('avatars/'+avatarKey));
viewer=null;
let image=await routes.GET(new Request(origin+savedAvatar.data.avatar));
assert.equal(image.status,200);assert.equal(image.headers.get('content-type'),'image/png');assert((await image.arrayBuffer()).byteLength>32);
viewer='avatar-other';await request('profile/avatar','DELETE');
assert(uploads.has('avatars/'+avatarKey)); // cannot delete someone else's photo
viewer='avatar-owner';const replacedAvatar=await request('profile/avatar','PUT',entry('replacement avatar'));
assert.notEqual(replacedAvatar.data.avatar,savedAvatar.data.avatar);assert(!uploads.has('avatars/'+avatarKey));
assert.equal((await routes.GET(new Request(origin+savedAvatar.data.avatar))).status,404);
await request('profile/avatar','DELETE');assert.equal((await request('state')).data.profile.avatar,null);
assert.equal((await routes.GET(new Request(origin+replacedAvatar.data.avatar))).status,404);
console.log('PASS: avatar authentication, PNG upload/public read, profile persistence, invalid SVG rejection, owner-only replacement/deletion, old image cleanup.');
viewer='avatar-owner';
assert.equal((await request('profile/frame','PUT',{frame:'plain'})).status,200);
assert.equal((await request('profile/frame','PUT',{frame:'gold'})).status,403);
sql.prepare('UPDATE profiles SET premium_until=? WHERE id=?').run(seconds+60,'site:'+viewer);
assert.equal((await request('profile/frame','PUT',{frame:'gold'})).status,200);
assert.equal((await request('state')).data.profile.frame,'gold');
assert.equal((await request('profile/frame','PUT',{frame:'plain'})).status,200);
assert.equal((await request('state')).data.profile.frame,'plain');
console.log('PASS: Garage returns own photo/likes/rank; pending photos remain owner-only; default frame is free and paid frames require Premium.');


// Delegated competition access, using the actual API handlers and SQL schema.
viewer='owner';
await request('profile/nickname','PUT',{nickname:'ArenaOwner'});
const staffRound=await createRound('Assigned team contest');
const privateRound=await createRound('Owner only contest');
viewer='scope-entry';await request('profile/nickname','PUT',{nickname:'ScopeEntry'});
const scopeEntry=(await request('rounds/'+staffRound+'/entries','POST',entry('Scoped Build'))).data.id;
viewer='private-entry';await request('profile/nickname','PUT',{nickname:'PrivateEntry'});
const privateEntry=(await request('rounds/'+privateRound+'/entries','POST',entry('Private Build'))).data.id;
viewer='staff-alex';await request('profile/nickname','PUT',{nickname:'StaffAlex'});
assert.equal((await request('state')).data.role,'participant');
assert.equal((await request('state')).data.admin,false);
assert.equal((await request('admin/session')).status,403);
viewer='owner';
assert.equal((await request('admin/access','POST',{nickname:'MissingProfile',canCreate:false})).status,404);
assert.equal((await request('admin/access','POST',{nickname:'ArenaOwner',canCreate:true})).status,409);
assert.equal((await request('admin/access','POST',{nickname:'@staffalex',canCreate:false})).status,200);
await request('admin/moderation/'+privateEntry,'POST',{decision:'rejected',reason:'Owner-only fixture'});
viewer='staff-alex';
assert.deepEqual((await request('admin/session')).data,{role:'organizer',canCreate:false});
assert.equal((await request('state')).data.admin,true);
assert.equal((await request('admin/rounds')).data.rounds.length,0);
assert.equal((await request('admin/overview')).data.summary.rounds,0);
assert.equal((await request('admin/rounds','POST',{title:'Denied create',notice:'',prize:'',minutes:1})).status,403);
for(const path of ['admin/access','admin/commerce','admin/sponsors'])assert.equal((await request(path)).status,403,path);
assert.equal((await request('admin/access','POST',{nickname:'PrivateEntry',canCreate:true})).status,403);
assert.equal((await request('admin/access/revoke','POST',{userId:'site:owner'})).status,403);
assert.equal((await request('admin/access/rounds/'+staffRound,'PUT',{userId:'site:staff-alex',assigned:true})).status,403);
assert.equal((await request('admin/commerce/settings','POST',{seller:'Unauthorized'})).status,403);
assert.equal((await request('rounds','POST',{kind:'weekly'})).status,403);
viewer='owner';
assert.equal((await request('admin/access/rounds/'+staffRound,'PUT',{userId:'site:staff-alex',assigned:true})).status,200);
assert.equal((await request('admin/access/rounds/'+staffRound)).data.members[0].assigned,1);
viewer='staff-alex';
assert.deepEqual((await request('admin/rounds')).data.rounds.map(r=>r.id),[staffRound]);
const scopedSummary=(await request('admin/overview')).data;
assert.equal(scopedSummary.summary.rounds,1);assert.equal(scopedSummary.summary.entries,1);
assert(!('profiles' in scopedSummary.summary));assert(!('premium' in scopedSummary.summary));
assert(scopedSummary.activity.every(e=>e.round_id===staffRound));
assert.equal((await request('admin/rounds/'+staffRound)).status,200);
assert.equal((await request('admin/rounds/'+privateRound)).status,403);
assert.equal((await request('admin/rounds/'+privateRound+'/notice','POST',{notice:'Forbidden'})).status,403);
assert.equal((await request('admin/rounds/'+privateRound+'/announce','POST')).status,403);
assert.equal((await request('admin/moderation/'+privateEntry,'POST',{decision:'approved',reason:''})).status,403);
assert.equal((await routes.GET(new Request(origin+'/api/media/'+privateEntry))).status,404);
assert.equal((await request('admin/rounds/'+staffRound+'/notice','POST',{notice:'Team announcement'})).status,200);
assert.equal((await request('admin/rounds/'+staffRound+'/notice','POST',{notice:'Cross-site'}, {Origin:'https://outside.invalid'})).status,403);
assert.equal((await request('admin/moderation/'+scopeEntry,'POST',{decision:'rejected',reason:''})).status,400);
assert.equal((await request('admin/moderation/'+scopeEntry,'POST',{decision:'rejected',reason:'Fixture team review'})).status,200);
assert.equal((await routes.GET(new Request(origin+'/api/media/'+scopeEntry))).status,200);
viewer='participant-outsider';
assert.equal((await routes.GET(new Request(origin+'/api/media/'+scopeEntry))).status,404);
viewer='staff-alex';
assert.equal((await request('admin/moderation/'+scopeEntry,'POST',{decision:'approved',reason:'Reviewed'})).status,200);
await request('profile/nickname','PUT',{nickname:'StaffRenamed'});
assert.equal((await request('admin/rounds/'+staffRound)).status,200); // stable account identity
viewer='owner';
assert.equal((await request('admin/access','POST',{nickname:'StaffRenamed',canCreate:true})).status,200);
viewer='staff-alex';
assert.equal((await request('admin/session')).data.canCreate,true);
const ownTeamRound=(await request('admin/rounds','POST',{title:'Organizer created contest',notice:'',prize:'',minutes:1}));
assert.equal(ownTeamRound.status,201);
assert.equal((await request('admin/rounds/'+ownTeamRound.data.id)).status,200);
assert.equal(sql.prepare('SELECT user_id FROM round_organizers WHERE round_id=?').get(ownTeamRound.data.id).user_id,'site:staff-alex');
assert.equal((await request('admin/rounds/'+privateRound)).status,403);
// Server-rendered pages enforce the same boundary as their APIs.
const pages={};
for(const name of ['admin','business','home']){
 const built=await build({entryPoints:[name==='home'?'app/page.tsx':'app/'+name+'/page.tsx'],bundle:true,format:'esm',platform:'node',write:false,jsx:'automatic',plugins:[{name:'page-access-fixtures',setup(b){
  b.onResolve({filter:/^(cloudflare:workers|@\/app\/chatgpt-auth|next\/headers|next\/navigation|react\/jsx-runtime)$/},a=>({path:a.path,namespace:'fixture'}));
  b.onResolve({filter:/(?:admin-panel|business-panel|arena|welcome)$/},a=>({path:'panel',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='cloudflare:workers'?'export const env=globalThis.__tuneArenaFixture.env':a.path==='@/app/chatgpt-auth'?'export async function getChatGPTUser(){return globalThis.__tuneArenaFixture.identity()}':a.path==='next/headers'?'export async function headers(){return new Headers()}':a.path==='next/navigation'?'export function redirect(url){throw new Error("redirect:"+url)}':a.path==='react/jsx-runtime'?'export function jsx(type,props){return {type,props}}':'export default function Panel(){}'}));
 }}]});
 pages[name]=(await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'))).default;
}
assert((await pages.home({searchParams:Promise.resolve({})})).props.initialLanguage);
assert.equal((await pages.admin()).props.initialAccess.role,'organizer');
await assert.rejects(pages.business(),/redirect:\//);
viewer='participant-outsider';
await assert.rejects(pages.admin(),/redirect:\//);await assert.rejects(pages.business(),/redirect:\//);
viewer=null;await assert.rejects(pages.admin(),/redirect:\//);
assert((await pages.home({searchParams:Promise.resolve({})})).props.locale);

assert.equal((await request('admin/access')).status,401);
viewer='owner';assert.equal((await pages.admin()).props.initialAccess.role,'owner');assert(await pages.business());
assert.equal((await request('admin/access/rounds/'+staffRound,'PUT',{userId:'site:staff-alex',assigned:false})).status,200);
viewer='staff-alex';assert.equal((await request('admin/rounds/'+staffRound)).status,403); // same signed-in account
assert.equal((await request('admin/rounds/'+ownTeamRound.data.id)).status,200);
viewer='owner';assert.equal((await request('admin/access/revoke','POST',{userId:'site:staff-alex'})).status,200);
viewer='staff-alex';
assert.equal((await request('state')).data.admin,false);
assert.equal((await request('state')).data.role,'participant');
assert.equal((await request('admin/rounds/'+ownTeamRound.data.id)).status,403); // round ownership is not a staff grant
assert.equal((await request('admin/overview')).status,403);
await assert.rejects(pages.admin(),/redirect:\//);
viewer='owner';await request('admin/access','POST',{nickname:'StaffRenamed',canCreate:false});
viewer='staff-alex';assert.equal((await request('admin/rounds')).data.rounds.length,0); // regrant never resurrects assignments
viewer='owner';const accessHistory=(await request('admin/access')).data;
for(const action of ['organizer_granted','organizer_create_enabled','round_assigned','round_unassigned','round_created','organizer_revoked'])assert(accessHistory.events.some(e=>e.action===action),action);
assert.equal((await request('admin/rounds/'+privateRound)).status,200);
console.log('PASS: owner-only grants/revocation, explicit per-contest assignment, organizer creation permission and automatic assignment, stable identity after nickname change, scoped statistics/history/media/moderation, cross-contest and financial denials, SSR page protection, immediate revocation and clean regrant, access audit.');


// The main tournament must be stable across identity changes and private practice.
seconds+=7200;
viewer='owner';
const mainRound=await request('rounds','POST',{kind:'weekly'});
assert.equal(mainRound.status,201);
assert.equal(sql.prepare('SELECT count(*) n FROM entries WHERE round_id=?').get(mainRound.data.id).n,0);
const personal=await request('rounds','POST',{kind:'test'});
assert.equal(personal.status,201);
assert.equal((await request('state')).data.round.id,mainRound.data.id);
assert.equal((await request('state?round='+personal.data.id)).data.round.id,personal.data.id);
viewer=null;
assert.equal((await request('state')).data.round.id,mainRound.data.id);
viewer='default-round-driver';
assert.equal((await request('state')).data.round.id,mainRound.data.id);
// A newer scheduled tournament must not displace the open one.
sql.prepare("INSERT INTO rounds(id,owner,kind,opens,closes,submission_closes) VALUES('future-main','site:owner','weekly',?,?,?)").run(seconds+60,seconds+120,seconds+100);
assert.equal((await request('state')).data.round.id,mainRound.data.id);
console.log('PASS: the same public tournament opens for guests and members; practice and future rounds cannot hijack the default; new public rounds contain no demos.');

// Legacy demo photos must never accept public votes or affect either podium.
viewer='owner';
const participantRound=await createRound('Participants only');
sql.prepare("INSERT INTO entries(id,round_id,owner,name,description,media,created) VALUES('legacy-demo',?,'sample:night','Legacy demo','Demo','sample:night',?)").run(participantRound,seconds);
viewer='participant-only-author';
await request('profile/nickname','PUT',{nickname:'ParticipantOnly'});
const real=await request('rounds/'+participantRound+'/entries','POST',entry('Real participant'));
assert.equal(real.status,201);
viewer='participant-only-voter';
await request('state');
sql.prepare('UPDATE profiles SET premium_until=? WHERE id=?').run(seconds+500,'site:participant-only-voter');
assert.equal((await request('rounds/'+participantRound+'/votes/legacy-demo','PUT')).status,404);
assert.equal((await request('rounds/'+participantRound+'/motors/legacy-demo','PUT')).status,404);
assert.equal((await request('rounds/'+participantRound+'/votes/'+real.data.id,'PUT')).status,200);
// Simulate historical seed reactions retained in the database.
for(let i=0;i<10;i++)sql.prepare('INSERT INTO votes(entry_id,voter,created,value) VALUES(?,?,?,1)').run('legacy-demo','demo-voter-'+i,seconds);
const actual=(await request('state?round='+participantRound)).data;
assert.deepEqual(actual.entries.map(e=>e.id),[real.data.id]);
assert.equal(actual.entries[0].likes,1);
seconds=actual.round.closes;
const completed=(await request('state?round='+participantRound)).data;
assert.equal(completed.winner.id,real.data.id);
assert.equal(completed.overallWinner.id,real.data.id);
const participantResults=(await request('winners')).data.rounds.find(r=>r.id===participantRound);
assert.equal(participantResults.winner.id,real.data.id);
assert.equal(participantResults.overallWinner.id,real.data.id);
for(const category of ['popular','overall'])assert.deepEqual(participantResults.podium[category].map(e=>e.id),[real.data.id]);
assert.equal(participantResults.rewardGranted,true);
console.log('PASS: legacy public demos cannot receive likes/Turbo, enter rankings, win either award or displace real participant rewards.');

// Exercise real OIDC signature verification, browser-bound state and replay protection.
viewer=null;
const authEnv=globalThis.__tuneArenaFixture.env;
authEnv.APP_ORIGIN=origin;
const cryptoClock=Math.floor(Date.now()/1000);
const keyPair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const publicKey=await crypto.subtle.exportKey('jwk',keyPair.publicKey);
const b64=v=>Buffer.from(typeof v==='string'?v:JSON.stringify(v)).toString('base64url');
let idToken='',tokenFetches=0;
const beforeAuthFetch=globalThis.fetch;
globalThis.fetch=async(url)=>{
 if(String(url).includes('/token')){tokenFetches++;return Response.json({id_token:idToken});}
 if(String(url).includes('/jwks.json'))return Response.json({keys:[{...publicKey,kid:'fixture-key'}]});
 throw new Error('Unexpected authentication fetch');
};
async function signedClaims(claims){const input=b64({alg:'RS256',kid:'fixture-key'})+'.'+b64(claims);const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keyPair.privateKey,new TextEncoder().encode(input));return input+'.'+Buffer.from(signature).toString('base64url');}
for(const provider of ['telegram']){
 authEnv[provider.toUpperCase()+'_CLIENT_ID']='client-'+provider;
 authEnv[provider.toUpperCase()+'_CLIENT_SECRET']='fixture-secret';
 for(const invalid of [false,true]){
  const start=await routes.GET(new Request(origin+'/api/auth/'+provider));
  assert.equal(start.status,303);const authUrl=new URL(start.headers.get('location'));
  const authCookie=start.headers.get('set-cookie').split(';')[0];
  assert.equal(authUrl.searchParams.get('redirect_uri'),origin+'/api/auth/'+provider+'/callback');
  if(provider==='telegram')assert.equal(authUrl.searchParams.get('code_challenge_method'),'S256');
  idToken=await signedClaims({iss:'https://oauth.telegram.org',aud:invalid?'wrong-audience':'client-'+provider,sub:'fixture-'+provider,iat:cryptoClock,exp:cryptoClock+300});
  const callback=origin+'/api/auth/'+provider+'/callback?code=fixture&state='+authUrl.searchParams.get('state');
  const withoutCookie=await routes.GET(new Request(callback));assert(withoutCookie.headers.get('location').includes('auth=expired'));
  const result=await routes.GET(new Request(callback,{headers:{cookie:authCookie}}));
  assert.equal(result.status,303);assert(result.headers.get('location').includes(invalid?'auth=expired':'garage=1'));
  if(!invalid)assert(result.headers.get('set-cookie').includes('ta_session='));
  const beforeReplay=tokenFetches;
  const replay=await routes.GET(new Request(callback,{headers:{cookie:authCookie}}));assert(replay.headers.get('location').includes('auth=expired'));assert.equal(tokenFetches,beforeReplay);
 }
 delete authEnv[provider.toUpperCase()+'_CLIENT_ID'];delete authEnv[provider.toUpperCase()+'_CLIENT_SECRET'];
 const unavailable=await routes.GET(new Request(origin+'/api/auth/'+provider));assert(unavailable.headers.get('location').includes('provider_unavailable='+provider));
}
for(const provider of ['google','apple','phone','email']){assert.equal((await request('auth/'+provider)).status,404);assert.equal((await request('auth/'+provider,'POST',{})).status,404);}
assert.deepEqual(Object.keys((await request('auth/options')).data),['telegram']);
globalThis.fetch=beforeAuthFetch;
delete authEnv.APP_ORIGIN;
console.log('PASS: Telegram signed OIDC callbacks, audience rejection, browser-bound state, one-time codes, session cookies, direct Garage return and unconfigured-provider fallback.');
viewer=null;
let catalogueOffset=0;const publicRoundIds=[];
do{const page=await request('rounds?offset='+catalogueOffset);assert.equal(page.status,200);assert(page.data.rounds.length<=30);publicRoundIds.push(...page.data.rounds.map(r=>r.id));catalogueOffset=page.data.next;}while(catalogueOffset!==null);
assert.equal(new Set(publicRoundIds).size,publicRoundIds.length);
assert.equal(publicRoundIds.length,sql.prepare("SELECT count(*) n FROM rounds WHERE kind='weekly'").get().n);
assert(!publicRoundIds.includes(personal.data.id));assert(publicRoundIds.includes('future-main'));
console.log('PASS: public tour catalogue paginates all weekly rounds, including upcoming rounds, and excludes private practice rounds.');
// Account deletion uses real production handlers and transactional SQLite/R2 fixtures.
viewer=null;
assert.equal((await request('account','DELETE',{confirmation:'DELETE'})).status,401);
viewer='delete-target';
await request('profile/nickname','PUT',{nickname:'DeleteTarget'});
assert.equal((await request('account','DELETE',{})).status,400);
assert.equal((await request('account','DELETE',{confirmation:'DELETE',userId:'site:owner'})).status,400);
assert.equal((await request('account','DELETE',{confirmation:'DELETE'},{Origin:'https://foreign.invalid'})).status,403);
assert(sql.prepare("SELECT id FROM profiles WHERE id='site:delete-target'").get());
viewer='owner';
const deletionPast=await createRound('Deletion archived fixture');
viewer='delete-target';
const deletionPastEntry=(await request('rounds/'+deletionPast+'/entries','POST',entry('Personal past title'))).data.id;
viewer='deletion-peer';await request('state');
assert.equal((await request('rounds/'+deletionPast+'/votes/'+deletionPastEntry,'PUT')).status,200);
seconds+=60;
const beforeDeletionOutcome=(await request('state?round='+deletionPast)).data;
assert.equal(beforeDeletionOutcome.winner.id,deletionPastEntry);
viewer='owner';
const deletionActive=await createRound('Deletion current fixture');
viewer='delete-target';
const deletionActiveEntry=(await request('rounds/'+deletionActive+'/entries','POST',entry('Personal active title'))).data.id;
const deletedAvatar=(await request('profile/avatar','PUT',entry('avatar'))).data.avatar;
const privateDeletionRound=(await request('rounds','POST',{kind:'test'})).data.id;
viewer='deletion-peer';await request('profile/nickname','PUT',{nickname:'SurvivingPeer'});
const peerEntry=(await request('rounds/'+deletionActive+'/entries','POST',entry('Surviving car'))).data.id;
viewer='delete-target';await request('state?round='+deletionActive);
sql.prepare("UPDATE profiles SET premium_until=? WHERE id='site:delete-target'").run(seconds+3600);
assert.equal((await request('rounds/'+deletionActive+'/votes/'+peerEntry,'PUT')).status,200);
assert.equal((await request('rounds/'+deletionActive+'/motors/'+peerEntry,'PUT')).status,200);
const peerBeforeDeletion={...sql.prepare("SELECT * FROM profiles WHERE id='site:deletion-peer'").get()};
const peerEntryBeforeDeletion={...sql.prepare('SELECT * FROM entries WHERE id=?').get(peerEntry)};
const objectsBefore=[...uploads.keys()].filter(key=>key===deletedAvatar.replace('/api/','')||key===sql.prepare('SELECT media FROM entries WHERE id=?').get(deletionPastEntry).media||key===sql.prepare('SELECT media FROM entries WHERE id=?').get(deletionActiveEntry).media);
assert.equal(objectsBefore.length,3);
const sessionRaw='d'.repeat(43);
const sessionHash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(sessionRaw))).toString('base64url');
sql.prepare('INSERT INTO sessions VALUES(?,?,?)').run(sessionHash,'site:delete-target',seconds+3600);
sql.prepare("INSERT INTO identities VALUES('telegram','deletion-subject','site:delete-target')").run();
sql.prepare("INSERT INTO organizers VALUES('site:delete-target',1,'site:owner',?)").run(seconds);
sql.prepare("INSERT INTO round_organizers VALUES(?,'site:delete-target','site:owner',?)").run(deletionActive,seconds);
sql.prepare("INSERT INTO comments VALUES('delete-comment',?,'site:delete-target','Personal comment',?,0)").run(peerEntry,seconds);
sql.prepare("INSERT INTO referrals(invitee,inviter,joined) VALUES('site:delete-target','site:deletion-peer',?)").run(seconds);
sql.prepare("INSERT INTO products(id,name,kind,amount,currency,created,active) VALUES('deletion-product','Fixture item','merch',100,'eur',?,1)").run(seconds);
for(const state of ['paid','pending']){
 sql.prepare("INSERT INTO commerce_orders(id,owner,request_key,product_id,name,kind,amount,currency,quantity,duration,payment_method,created,expires,state,tracking,refund_reason,external_reference) VALUES(?,'site:delete-target',?,'deletion-product','Fixture item','merch',100,'eur',1,0,'invoice',?,?,?,'Personal tracking','Personal reason','Personal reference')").run('deletion-order-'+state,'key-'+state,seconds,seconds+3600,state);
 sql.prepare('INSERT INTO order_shipping VALUES(?,?)').run('deletion-order-'+state,'Personal delivery address');
}
sql.prepare("INSERT INTO commerce_entitlements(order_id,owner,kind,starts,ends) VALUES('deletion-order-paid','site:delete-target','priority',?,?)").run(seconds,seconds+3600);
await request('trophies');
sql.prepare("UPDATE trophies SET wallet=? WHERE owner='site:delete-target'").run('0x'+'a'.repeat(40));
// A transient object-store outage must not leave the account accessible or lose cleanup work.
const deleteObject=globalThis.__tuneArenaFixture.env.BUCKET.delete;
globalThis.__tuneArenaFixture.env.BUCKET.delete=async()=>{throw new Error('Fixture storage outage');};
const erased=await request('account','DELETE',{confirmation:'DELETE'});
assert.equal(erased.status,200);assert.equal(erased.data.ok,true);
for(const name of ['ta_session','ta_auth','ta_ref'])assert(erased.cookie.includes(name+'=; Max-Age=0'));
assert(!sql.prepare("SELECT id FROM profiles WHERE id='site:delete-target'").get());
assert(sql.prepare("SELECT user_id FROM deleted_accounts WHERE user_id='site:delete-target'").get());
for(const table of ['sessions','identities','organizers','round_organizers','referral_codes'])assert.equal(sql.prepare('SELECT count(*) n FROM '+table+" WHERE user_id='site:delete-target'").get().n,0);
assert.equal(sql.prepare("SELECT count(*) n FROM referrals WHERE inviter='site:delete-target' OR invitee='site:delete-target'").get().n,0);
assert.equal(sql.prepare("SELECT count(*) n FROM avatars WHERE owner='site:delete-target'").get().n,0);
assert.equal(sql.prepare("SELECT count(*) n FROM comments WHERE author='site:delete-target'").get().n,0);
assert.equal(sql.prepare("SELECT count(*) n FROM order_shipping WHERE order_id LIKE 'deletion-order-%'").get().n,0);
assert.equal(sql.prepare("SELECT state FROM commerce_orders WHERE id='deletion-order-pending'").get().state,'cancelled');
assert.equal(sql.prepare("SELECT state FROM commerce_orders WHERE id='deletion-order-paid'").get().state,'paid');
assert.equal(sql.prepare("SELECT revoked FROM commerce_entitlements WHERE order_id='deletion-order-paid'").get().revoked,1);
assert.equal(sql.prepare("SELECT count(*) n FROM trophies WHERE owner='site:delete-target' OR (entry_id=? AND wallet<>'')").get(deletionPastEntry).n,0);
const anonymousEntry=sql.prepare('SELECT * FROM entries WHERE id=?').get(deletionActiveEntry);
assert(anonymousEntry.owner.startsWith('deleted:'));assert.equal(anonymousEntry.media,'');assert.equal(anonymousEntry.description,'');assert.equal(anonymousEntry.hidden,1);assert.equal(anonymousEntry.withdrawn,1);
assert.equal((await request('state')).data.signedIn,false); // A stale platform identity cannot restore the profile.
assert.equal((await request('profile/avatar','PUT',entry('blocked'))).status,401);
assert.equal((await routes.GET(new Request(origin+'/api/media/'+deletionPastEntry))).status,404);
assert.equal((await routes.GET(new Request(origin+deletedAvatar))).status,404);
viewer=null;
assert.equal((await request('state','GET',undefined,{Cookie:'ta_session='+sessionRaw})).data.signedIn,false);
assert.deepEqual({...sql.prepare("SELECT * FROM profiles WHERE id='site:deletion-peer'").get()},peerBeforeDeletion);
assert.deepEqual({...sql.prepare('SELECT * FROM entries WHERE id=?').get(peerEntry)},peerEntryBeforeDeletion);
assert.equal((await request('state?round='+deletionPast)).data.winner.id,beforeDeletionOutcome.winner.id);
assert.equal((await request('state?round='+deletionPast)).data.overallWinner.score,beforeDeletionOutcome.overallWinner.score);
assert.equal((await request('state?round='+privateDeletionRound)).status,404);
assert(sql.prepare('SELECT count(*) n FROM media_deletion_jobs').get().n>=3);
assert(objectsBefore.every(key=>uploads.has(key)));
globalThis.__tuneArenaFixture.env.BUCKET.delete=deleteObject;
await request('state');
assert(objectsBefore.every(key=>!uploads.has(key)));
assert.equal(sql.prepare('SELECT count(*) n FROM media_deletion_jobs').get().n,0);
// Writes admitted just before deletion are still rejected at the database boundary.
assert.throws(()=>sql.prepare("INSERT INTO profiles(id) VALUES('site:delete-target')").run(),/account_deleted/);
assert.throws(()=>sql.prepare("INSERT INTO sessions VALUES('stale-session','site:delete-target',?)").run(seconds+3600),/account_deleted/);
assert.throws(()=>sql.prepare("INSERT INTO entries(id,round_id,owner,name,description,media,created) VALUES('stale-entry',?,'site:delete-target','Late','Late','entries/late',?)").run(deletionActive,seconds),/account_deleted/);
// SQL failure rolls back session revocation, the deletion marker and media detachment together.
viewer='deletion-rollback';await request('profile/nickname','PUT',{nickname:'DeletionRollback'});
const rollbackAvatar=(await request('profile/avatar','PUT',entry('avatar'))).data.avatar;
sql.exec("CREATE TRIGGER deletion_fixture_failure BEFORE DELETE ON profiles WHEN OLD.id='site:deletion-rollback' BEGIN SELECT RAISE(ABORT,'fixture_failure'); END;");
assert.equal((await request('account','DELETE',{confirmation:'DELETE'})).status,500);
assert(sql.prepare("SELECT id FROM profiles WHERE id='site:deletion-rollback'").get());
assert(!sql.prepare("SELECT user_id FROM deleted_accounts WHERE user_id='site:deletion-rollback'").get());
assert(uploads.has(rollbackAvatar.replace('/api/','')));
assert.equal((await request('state')).data.signedIn,true);
sql.exec('DROP TRIGGER deletion_fixture_failure');
assert.equal((await request('account','DELETE',{confirmation:'DELETE'})).status,200);
assert.equal((await request('state')).data.signedIn,false);
console.log('PASS: confirmed self-only deletion, CSRF/authentication, irreversible sign-out across sessions, profile/photo/referral/staff cleanup, anonymous historical scores, unaffected other users, durable R2 retry, stale-write rejection and atomic rollback.');

// Export-only security: platform headers are never trusted by a standalone server.
seconds=Math.floor(Date.now()/1000);
const standaloneEnv=globalThis.__tuneArenaFixture.env;
standaloneEnv.TRUST_SITE_AUTH='0';viewer='owner';
assert.equal((await request('state')).data.signedIn,false);
assert.equal((await request('admin/access')).status,401);
standaloneEnv.ENVIRONMENT='production';standaloneEnv.LOCAL_DEV_AUTH='1';standaloneEnv.LOCAL_DEV_ADMIN='1';
assert.equal((await request('auth/dev','POST')).status,404);
assert.equal((await request('auth/options')).data.local,undefined);
for(const removed of ['google','apple','phone','email'])assert.equal((await request('auth/'+removed,'POST',{})).status,404);
standaloneEnv.ENVIRONMENT='development';standaloneEnv.APP_ORIGIN='http://localhost:5173';
async function localRequest(path,method='GET',cookie='',body){
 const response=await routes[method](new Request('http://localhost:5173/api/'+path,{method,headers:{Origin:'http://localhost:5173',Cookie:cookie,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}));
 return {status:response.status,data:response.headers.get('Content-Type')?.includes('application/json')?await response.json():null,cookie:response.headers.get('set-cookie'),location:response.headers.get('location')};
}
assert.equal((await localRequest('auth/options')).data.local,true);
assert.equal((await request('auth/dev','POST')).status,403); // hostname/origin mismatch
const demo=await localRequest('auth/dev','POST');assert.equal(demo.status,303);assert(demo.location.endsWith('/?garage=1'));
assert(!demo.cookie.includes(' Secure;'));
let demoCookie=demo.cookie.split(';')[0];
const devState=(await localRequest('state','GET',demoCookie)).data;
assert.equal(devState.signedIn,true);assert.equal(devState.admin,true);
const secondDemo=await localRequest('auth/dev','POST');
const secondCookie=secondDemo.cookie.split(';')[0];
const logout=await localRequest('auth/logout','POST',demoCookie);assert.equal(logout.status,303);
assert.equal((await localRequest('state','GET',demoCookie)).data.signedIn,false);
demoCookie=secondCookie;
assert.equal((await localRequest('state','GET',demoCookie)).data.signedIn,true);
standaloneEnv.LOCAL_DEV_ADMIN='0';
assert.equal((await localRequest('state','GET',demoCookie)).data.admin,false);
// The configured Telegram numeric ID requires the matching verified provider identity.
const devId=sql.prepare("SELECT user_id FROM identities WHERE provider='dev'").get().user_id;
standaloneEnv.TUNE_ADMIN_TELEGRAM_ID='314159';
const tgKey=createHash('sha256').update('telegram:314159').digest('base64url');
sql.prepare("INSERT INTO identities(provider,subject,user_id) VALUES('telegram',?,?)").run(tgKey,devId);
assert.equal((await localRequest('state','GET',demoCookie)).data.admin,true);
standaloneEnv.TUNE_ADMIN_TELEGRAM_ID='271828';
assert.equal((await localRequest('state','GET',demoCookie)).data.admin,false);
standaloneEnv.TUNE_ADMIN_TELEGRAM_ID='314159';
standaloneEnv.ENVIRONMENT='production';standaloneEnv.APP_ORIGIN=origin;
assert.equal((await request('state','GET',undefined,{Cookie:demoCookie})).data.admin,true);
assert.equal((await request('auth/dev','POST')).status,404);
assert.equal((await request('account','DELETE',{confirmation:'DELETE'},{Cookie:demoCookie})).status,200);
assert.equal((await request('state','GET',undefined,{Cookie:demoCookie})).data.signedIn,false);
assert.equal((await request('admin/access','GET',undefined,{Cookie:demoCookie})).status,401);
console.log('PASS: standalone rejects spoofed platform identity, production disables demo and removed providers, localhost-only login, verified Telegram administrator, wrong-ID denial and deletion revokes administration.');

{
// Mini App sessions: production routes, real HMAC, fixture D1 transactions.
const miniEnv=globalThis.__tuneArenaFixture.env;
miniEnv.TELEGRAM_BOT_TOKEN='123456:fixture-mini-bot-token';
miniEnv.TUNE_ADMIN_TELEGRAM_IDS='314159,271828';delete miniEnv.TUNE_ADMIN_TELEGRAM_ID;
seconds=Math.floor(Date.now()/1000);viewer=null;
let launchCounter=0;
function miniLaunch(id=314159,issued=Math.floor(Date.now()/1000)){
 const p=new URLSearchParams({auth_date:String(issued),user:JSON.stringify({id,first_name:'Fixture',admin:true}),query_id:'mini-'+(++launchCounter)});
 const data=[...p].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>k+'='+v).join('\n');
 const key=createHmac('sha256','WebAppData').update(miniEnv.TELEGRAM_BOT_TOKEN).digest();
 p.set('hash',createHmac('sha256',key).update(data).digest('hex'));return p.toString();
}
const miniLogin=(raw,cookie='')=>request('auth/telegram/mini','POST',{initData:raw},{Cookie:cookie});
assert.equal((await miniLogin(miniLaunch().replace('Fixture','Tampered'))).status,401);
assert.equal((await miniLogin(miniLaunch(314159,Math.floor(Date.now()/1000)-301))).status,401);
assert.equal((await request('auth/telegram/mini','POST',{initData:miniLaunch()},{Origin:'https://foreign.invalid'})).status,403);
const launch=miniLaunch();const signedMini=await miniLogin(launch);assert.equal(signedMini.status,200);assert.equal(signedMini.data.changed,true);
assert(signedMini.cookie.includes('HttpOnly'));assert(signedMini.cookie.includes('Secure'));
const miniCookie=signedMini.cookie.split(';')[0];
assert.equal((await request('state','GET',undefined,{Cookie:miniCookie})).data.admin,true);
assert.equal((await miniLogin(launch,miniCookie)).data.changed,false);
assert.equal((await miniLogin(launch)).status,401); // replay from another browser
assert.equal((await miniLogin(miniLaunch(314159,Math.floor(Date.now()/1000)-301),miniCookie)).data.changed,false); // existing valid session survives launch expiry
const miniSubject=createHash('sha256').update('telegram:314159').digest('base64url');
const firstMiniUser=sql.prepare("SELECT user_id FROM identities WHERE provider='telegram' AND subject=?").get(miniSubject).user_id;
const other=await miniLogin(miniLaunch(271828),miniCookie);assert.equal(other.status,200);
const otherCookie=other.cookie.split(';')[0];
assert.equal((await request('state','GET',undefined,{Cookie:otherCookie})).data.admin,true);
assert.equal((await request('state','GET',undefined,{Cookie:miniCookie})).data.signedIn,false);
assert.equal(sql.prepare("SELECT user_id FROM identities WHERE provider='telegram' AND subject=?").get(miniSubject).user_id,firstMiniUser); // no implicit linking
const ordinary=await miniLogin(miniLaunch(161803));const ordinaryCookie=ordinary.cookie.split(';')[0];
assert.equal((await request('state','GET',undefined,{Cookie:ordinaryCookie})).data.admin,false);
assert.equal((await request('admin/access','GET',undefined,{Cookie:ordinaryCookie})).status,403);
assert.equal((await miniLogin('x'.repeat(21000))).status,413);
const concurrent=miniLaunch(141421);
assert.deepEqual((await Promise.all([miniLogin(concurrent),miniLogin(concurrent)])).map(r=>r.status).sort(),[200,401]);
const rollbackLaunch=miniLaunch(173205);
sql.exec("CREATE TRIGGER mini_fixture_failure BEFORE INSERT ON sessions BEGIN SELECT RAISE(ABORT,'fixture_mini_failure'); END;");
assert.equal((await miniLogin(rollbackLaunch)).status,500);
sql.exec('DROP TRIGGER mini_fixture_failure');
assert.equal((await miniLogin(rollbackLaunch)).status,200); // marker and identity rolled back with session
assert.equal((await request('account','DELETE',{confirmation:'DELETE'},{Cookie:otherCookie})).status,200);
assert.equal((await request('admin/access','GET',undefined,{Cookie:otherCookie})).status,401);
const reused=await miniLogin(launch,otherCookie);assert.equal(reused.status,401);
delete miniEnv.TELEGRAM_BOT_TOKEN;
assert.equal((await miniLogin('unconfigured')).status,503);
console.log('PASS: Mini App HMAC sessions, CSRF, launch expiry, existing-session continuity, cross-browser replay rejection, concurrent launch consumption, atomic rollback, separate identities, multiple verified administrators, participant denial and deletion revocation.');

}
sql.close();
