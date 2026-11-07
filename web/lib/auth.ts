import { config, db, token, digest, now, origin, cookie, cookieHeader, failure, json, redirectTo, currentUser, localDevelopment } from "./worker";

const telegram = "https://oauth.telegram.org";
export const loginOptions = () => ({
  chatgpt: config.TRUST_SITE_AUTH==="1",
  local: localDevelopment(),
  email: !!(config.RESEND_API_KEY && config.EMAIL_FROM && config.APP_ORIGIN),
  telegram: !!(config.TELEGRAM_CLIENT_ID && config.TELEGRAM_CLIENT_SECRET && config.APP_ORIGIN),
});
const validToken = /^[a-zA-Z0-9_-]{43}$/;
const challengeCookie = "ta_auth";
const sessionCookie = "ta_session";

async function signIn(req: Request, provider: string, subject: string) {
  const key = await digest(provider + ":" + subject);
  const current = await currentUser(req);
  const user = current ?? crypto.randomUUID();
  await db().prepare("INSERT OR IGNORE INTO identities(provider,subject,user_id) VALUES(?,?,?)").bind(provider,key,user).run();
  const identity = await db().prepare("SELECT user_id FROM identities WHERE provider=? AND subject=?").bind(provider,key).first<{user_id:string}>();
  if (!identity || (current && current !== identity.user_id)) return failure("identity_in_use",409);
  const session = token();
  const ttl = 14*86400;
  const old = cookie(req,sessionCookie);
  if (validToken.test(old)) await db().prepare("DELETE FROM sessions WHERE id=?").bind(await digest(old)).run();
  await db().prepare("INSERT INTO sessions(id,user_id,expires) VALUES(?,?,?)").bind(await digest(session),identity.user_id,now()+ttl).run();
  return redirectTo(req,"/",[cookieHeader(sessionCookie,session,ttl),cookieHeader(challengeCookie,"",0)]);
}

async function emailStart(req: Request) {
  if (!loginOptions().email) return failure("provider_unavailable",503);
  const body = await req.json().catch(()=>null) as Record<string,unknown> | null;
  const email = typeof body?.email==="string" ? body.email.trim().toLowerCase() : "";
  if (email.length>254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) return failure("invalid_email");
  const proof=token(), browser=token(), id=await digest(proof), emailKey=await digest(email);
  const client=await digest((await currentUser(req)) ?? req.headers.get("cf-connecting-ip") ?? "unknown");
  await db().batch([
    db().prepare("DELETE FROM auth_challenges WHERE expires < unixepoch()-3600"),
    db().prepare("DELETE FROM sessions WHERE expires < unixepoch()"),
  ]);
  const added=await db().prepare(`INSERT INTO auth_challenges(id,kind,subject,browser,quota,secret,created,expires)
    SELECT ?,'email',?,?,?,?,unixepoch(),unixepoch()+900
    WHERE (SELECT count(*) FROM auth_challenges WHERE kind='email' AND secret=? AND created>unixepoch()-900)<3
      AND (SELECT count(*) FROM auth_challenges WHERE kind='email' AND quota=? AND created>unixepoch()-900)<8`)
    .bind(id,email,await digest(browser),client,emailKey,emailKey,client).run();
  if (!added.meta.changes) return failure("rate_limited",429);
  const link=new URL("/?confirm="+proof,origin(req)).href;
  const sent=await fetch("https://api.resend.com/emails",{
    method:"POST",headers:{Authorization:"Bearer "+config.RESEND_API_KEY,"Content-Type":"application/json"},
    body:JSON.stringify({from:config.EMAIL_FROM,to:[email],subject:"Tune Arena — email sign-in",text:"Open this link in the same browser to sign in. It expires in 15 minutes.\n"+link}),
    signal:AbortSignal.timeout(8000),
  }).catch(()=>null);
  if (!sent?.ok) return failure("provider_unavailable",503);
  return json({ok:true},200,{"Set-Cookie":cookieHeader(challengeCookie,browser,900)});
}

async function takeChallenge(req: Request, kind: string, proof: string) {
  const browser=cookie(req,challengeCookie);
  if (!validToken.test(proof) || !validToken.test(browser)) return null;
  return db().prepare(`UPDATE auth_challenges SET expires=0
    WHERE id=? AND kind=? AND browser=? AND expires>unixepoch()
    RETURNING subject,secret`)
    .bind(await digest(proof),kind,await digest(browser)).first<{subject:string,secret:string}>();
}

async function telegramStart(req: Request) {
  if (!loginOptions().telegram) return failure("provider_unavailable",503);
  const state=token(), verifier=token(), browser=token();
  await db().prepare(`INSERT INTO auth_challenges(id,kind,subject,browser,quota,secret,created,expires)
    VALUES(?,'telegram','',?,'',?,unixepoch(),unixepoch()+600)`)
    .bind(await digest(state),await digest(browser),verifier).run();
  const redirectUri=new URL("/api/auth/telegram/callback",origin(req)).href;
  const url=new URL(telegram+"/auth");
  url.search=new URLSearchParams({
    client_id:config.TELEGRAM_CLIENT_ID!,redirect_uri:redirectUri,response_type:"code",scope:"openid",
    state,code_challenge:await digest(verifier),code_challenge_method:"S256",
  }).toString();
  return redirectTo(req,url.href,[cookieHeader(challengeCookie,browser,600)]);
}

function decoded(segment: string) {
  return Uint8Array.from(atob(segment.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(segment.length/4)*4,"=")), c=>c.charCodeAt(0));
}
function readJson(segment: string) { return JSON.parse(new TextDecoder().decode(decoded(segment))); }

async function telegramSubject(jwt: string) {
  const parts=jwt.split(".");
  if (parts.length!==3 || jwt.length>16000) return null;
  const [h,p,s]=parts;
  const header=readJson(h);
  if (header.alg!=="RS256" || typeof header.kid!=="string") return null;
  const resp=await fetch(telegram+"/.well-known/jwks.json",{signal:AbortSignal.timeout(8000)});
  if (!resp.ok) return null;
  const keys=await resp.json() as {keys:Array<JsonWebKey&{kid:string}>};
  const jwk=keys.keys.find(key=>key.kid===header.kid && key.kty==="RSA");
  if (!jwk) return null;
  const algo={name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"};
  const key=await crypto.subtle.importKey("jwk",jwk,algo,false,["verify"]);
  if (!await crypto.subtle.verify(algo,key,decoded(s),new TextEncoder().encode(h+"."+p))) return null;
  const claims=readJson(p);
  const timestamp=now();
  if (claims.iss!==telegram || String(claims.aud)!==config.TELEGRAM_CLIENT_ID ||
      typeof claims.exp!=="number" || claims.exp<=timestamp || typeof claims.iat!=="number" ||
      claims.iat>timestamp+30 || claims.iat<timestamp-600 || typeof claims.sub!=="string" || !claims.sub) return null;
  return claims.sub;
}

async function telegramCallback(req: Request) {
  if (!loginOptions().telegram) return failure("provider_unavailable",503);
  const query=new URL(req.url).searchParams;
  const code=query.get("code"), state=query.get("state");
  const challenge=state && code && code.length<2048 ? await takeChallenge(req,"telegram",state) : null;
  if (!challenge) return redirectTo(req,"/?auth=expired");
  try {
    const res=await fetch(telegram+"/token",{
      method:"POST",headers:{
        Authorization:"Basic "+btoa(config.TELEGRAM_CLIENT_ID+":"+config.TELEGRAM_CLIENT_SECRET),
        "Content-Type":"application/x-www-form-urlencoded",
      },
      body:new URLSearchParams({grant_type:"authorization_code",code:code!,
        redirect_uri:new URL("/api/auth/telegram/callback",origin(req)).href,
        client_id:config.TELEGRAM_CLIENT_ID!,code_verifier:challenge.secret}),
      signal:AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const data=await res.json() as {id_token?:string};
      const subject=data.id_token ? await telegramSubject(data.id_token) : null;
      if (subject) return signIn(req,"telegram",subject);
    }
  } catch { /* Never log authorization codes or provider responses. */ }
  return redirectTo(req,"/?auth=expired");
}

export async function authRoute(req: Request, path: string) {
  if(req.method==="POST"&&path==="auth/dev") {
    if(!localDevelopment(req))return failure("not_found",404);
    return signIn(req,"dev","local-driver");
  }
  if(req.method==="POST"&&path==="auth/logout") {
    const session=cookie(req,sessionCookie);
    if(validToken.test(session))await db().prepare("DELETE FROM sessions WHERE id=?").bind(await digest(session)).run();
    return redirectTo(req,"/",[cookieHeader(sessionCookie,"",0)]);
  }
  if (req.method==="POST" && path==="auth/email") return emailStart(req);
  if (req.method==="POST" && path==="auth/email/verify") {
    if (!loginOptions().email) return failure("provider_unavailable",503);
    const payload=await req.json().catch(()=>null) as Record<string,unknown> | null;
    const challenge=typeof payload?.proof==="string" ? await takeChallenge(req,"email",payload.proof) : null;
    return challenge ? signIn(req,"email",challenge.subject) : failure("expired",400);
  }
  if (req.method==="GET" && path==="auth/telegram") return telegramStart(req);
  if (req.method==="GET" && path==="auth/telegram/callback") return telegramCallback(req);
  return failure("not_found",404);
}
