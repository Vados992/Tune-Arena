import { config, db, token, digest, now, origin, cookie, cookieHeader, failure, json, redirectTo, currentUser, localDevelopment } from "./worker";

const telegram = "https://oauth.telegram.org";
export const loginOptions = () => ({...(localDevelopment()?{local:true}:{}),telegram: !!(config.TELEGRAM_CLIENT_ID && config.TELEGRAM_CLIENT_SECRET && config.APP_ORIGIN)});
const validToken = /^[a-zA-Z0-9_-]{43}$/;
const challengeCookie = "ta_auth";
const sessionCookie = "ta_session";

export async function signIn(req: Request, provider: string, subject: string) {
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
  return redirectTo(req,"/?garage=1",[cookieHeader(sessionCookie,session,ttl),cookieHeader(challengeCookie,"",0)]);
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
  if (!loginOptions().telegram) return redirectTo(req,"/?register=1&provider_unavailable=telegram");
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
  if (!loginOptions().telegram) return redirectTo(req,"/?register=1&provider_unavailable=telegram");
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
  if(req.method==="GET"&&path==="auth/options")return json(loginOptions());
  if(req.method==="GET"&&path==="auth/telegram")return telegramStart(req);
  if(req.method==="GET"&&path==="auth/telegram/callback")return telegramCallback(req);
  return failure("not_found",404);
}
