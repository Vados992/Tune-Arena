import {db,json,failure,isAdministrator} from './worker';
import {textValue,httpsURL,integer} from './commerce-utils';
import {audit} from './commerce';
export const activeCampaigns=`SELECT c.*,s.name AS brand,s.logo,s.category,s.website FROM campaigns c JOIN sponsors s ON s.id=c.sponsor_id WHERE c.state='active' AND c.starts<=unixepoch() AND c.ends>unixepoch() AND c.confirmed=1`;
export async function sponsorPublic(round?:string){
 const campaigns=await db().prepare(activeCampaigns+(round?' AND (c.round_id=? OR c.round_id IS NULL)':'')+' ORDER BY c.starts DESC LIMIT 30').bind(...(round?[round]:[])).all();
 const posts=await db().prepare(`SELECT p.id,p.title,p.body,p.image,p.video,p.campaign_id,s.name AS brand,c.link,c.promo FROM sponsor_posts p JOIN campaigns c ON c.id=p.campaign_id JOIN sponsors s ON s.id=c.sponsor_id
 WHERE p.published=1 AND c.state='active' AND c.confirmed=1 AND c.starts<=unixepoch() AND c.ends>unixepoch() ORDER BY p.created DESC LIMIT 30`).all();
 return {campaigns:campaigns.results,posts:posts.results};
}
export async function sponsorEvent(req:Request,id:string,kind:string){
 const p=await req.json().catch(()=>null) as any;
 if(!p||!/^[-a-zA-Z0-9]{8,80}$/.test(p.eventId??'')||!['impression','click','promo'].includes(kind))return failure('invalid_event');
 await db().prepare(`INSERT OR IGNORE INTO sponsor_events(campaign_id,event_id,kind,created) SELECT id,?,?,unixepoch() FROM campaigns WHERE id=? AND state='active' AND starts<=unixepoch() AND ends>unixepoch() AND confirmed=1`).bind(p.eventId,kind,id).run();return json({ok:true});
}
export async function partnerLead(req:Request,user:string){
 const p=await req.json().catch(()=>null) as any;
 const brand=textValue(p?.brand,100),category=textValue(p?.category,100),offer=textValue(p?.offer,1500),contact=textValue(p?.contact,200);
 if(!brand||!category||!offer||!contact)return failure('invalid_lead');
 const count=await db().prepare('SELECT count(*) AS n FROM partner_leads WHERE owner=? AND created>unixepoch()-86400').bind(user).first<{n:number}>();if((count?.n??0)>=5)return failure('rate_limited',429);
 const id=crypto.randomUUID();await db().prepare('INSERT INTO partner_leads(id,owner,brand,category,offer,contact,created) VALUES(?,?,?,?,?,?,unixepoch())').bind(id,user,brand,category,offer,contact).run();return json({id},201);
}
export async function sponsorsAdmin(req:Request,user:string,path:string[]){
 if(!await isAdministrator(user))return failure('forbidden',403);
 if(req.method==='GET')return json({sponsors:(await db().prepare('SELECT * FROM sponsors ORDER BY created DESC').all()).results,campaigns:(await db().prepare(`SELECT c.*,s.name AS brand,
 (SELECT count(*) FROM sponsor_events e WHERE e.campaign_id=c.id AND e.kind='impression') AS impressions,
 (SELECT count(*) FROM sponsor_events e WHERE e.campaign_id=c.id AND e.kind='click') AS clicks,
 (SELECT count(*) FROM sponsor_events e WHERE e.campaign_id=c.id AND e.kind='promo') AS promos
 FROM campaigns c JOIN sponsors s ON s.id=c.sponsor_id ORDER BY c.created DESC`).all()).results,
 posts:(await db().prepare('SELECT * FROM sponsor_posts ORDER BY created DESC').all()).results,leads:(await db().prepare('SELECT * FROM partner_leads ORDER BY created DESC LIMIT 100').all()).results});
 const [section,id]=path,p=await req.json().catch(()=>null) as any;if(!p)return failure('invalid_data');
 if(section==='brands'){
 const name=textValue(p.name,100),category=textValue(p.category,100),logo=httpsURL(p.logo),website=httpsURL(p.website);if(!name||!category||logo===null||website===null)return failure('invalid_brand');
 const key=id??crypto.randomUUID();await db().batch([db().prepare(`INSERT INTO sponsors(id,name,category,logo,website,created) VALUES(?,?,?,?,?,unixepoch()) ON CONFLICT(id) DO UPDATE SET name=excluded.name,category=excluded.category,logo=excluded.logo,website=excluded.website`).bind(key,name,category,logo,website),audit(user,'brand_saved',key)]);return json({id:key});
 }
 if(section==='campaigns'){
 const title=textValue(p.title,120),promo=textValue(p.promo,100),prize=textValue(p.prize,300),link=httpsURL(p.link),ref=textValue(p.prizeReference,200);
 if(!title||promo===null||prize===null||link===null||ref===null||!['week','month'].includes(p.period)||!['draft','confirmed','active','closed','paused'].includes(p.state)||!integer(p.starts,1,9999999999)||!integer(p.ends,p.starts+1,9999999999)||!integer(p.feeMinor??0,0,100000000)||!['eur','usd','gbp'].includes(p.currency)||!['unconfirmed','committed','delivered'].includes(p.prizeState))return failure('invalid_campaign');
 if(['confirmed','active'].includes(p.state)&&(!p.confirmed||!ref||p.prizeState==='unconfirmed'))return failure('sponsor_commitment_required',409);
 if(!await db().prepare('SELECT id FROM sponsors WHERE id=?').bind(String(p.sponsorId)).first())return failure('invalid_brand');
 if(p.roundId&&!await db().prepare("SELECT id FROM rounds WHERE id=? AND kind='weekly'").bind(p.roundId).first())return failure('invalid_round');
 const key=id??crypto.randomUUID();await db().batch([db().prepare(`INSERT INTO campaigns(id,sponsor_id,round_id,period,title,starts,ends,state,link,promo,prize,prize_state,prize_reference,fee_minor,currency,confirmed,created)
 VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,unixepoch()) ON CONFLICT(id) DO UPDATE SET sponsor_id=excluded.sponsor_id,round_id=excluded.round_id,period=excluded.period,title=excluded.title,starts=excluded.starts,ends=excluded.ends,state=excluded.state,link=excluded.link,promo=excluded.promo,prize=excluded.prize,prize_state=excluded.prize_state,prize_reference=excluded.prize_reference,fee_minor=excluded.fee_minor,currency=excluded.currency,confirmed=excluded.confirmed`)
 .bind(key,p.sponsorId,p.roundId||null,p.period,title,p.starts,p.ends,p.state,link,promo,prize,p.prizeState,ref,p.feeMinor??0,p.currency,Number(!!p.confirmed)),audit(user,'campaign_saved',key,ref)]);return json({id:key});
 }
 if(section==='posts'){
 const title=textValue(p.title,120),body=textValue(p.body,5000),image=httpsURL(p.image),video=httpsURL(p.video);
 if(!title||!body||image===null||video===null||typeof p.published!=='boolean'||!await db().prepare('SELECT id FROM campaigns WHERE id=?').bind(String(p.campaignId)).first())return failure('invalid_post');
 const key=id??crypto.randomUUID();await db().batch([db().prepare(`INSERT INTO sponsor_posts(id,campaign_id,title,body,image,video,published,created) VALUES(?,?,?,?,?,?,?,unixepoch()) ON CONFLICT(id) DO UPDATE SET title=excluded.title,body=excluded.body,image=excluded.image,video=excluded.video,published=excluded.published`).bind(key,p.campaignId,title,body,image,video,Number(p.published)),audit(user,'sponsor_post_saved',key)]);return json({id:key});
 }
 if(section==='leads'&&id&&['new','contacted','agreed','closed'].includes(p.state)){await db().prepare('UPDATE partner_leads SET state=? WHERE id=?').bind(p.state,id).run();return json({ok:true});}
 return failure('not_found',404);
}
