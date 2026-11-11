import {administratorTelegramIds} from './telegram-init-data.mjs';
import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";

type Config = {
  DB: D1Database; BUCKET: R2Bucket; APP_ORIGIN?: string;
  TELEGRAM_BOT_TOKEN?:string; TUNE_ADMIN_TELEGRAM_IDS?:string;
  TELEGRAM_CLIENT_ID?: string; TELEGRAM_CLIENT_SECRET?: string;
  TUNE_ADMIN_EMAIL?: string; TUNE_ADMIN_TELEGRAM_ID?: string;
  TRUST_SITE_AUTH?:string; ENVIRONMENT?:string; LOCAL_DEV_AUTH?:string; LOCAL_DEV_ADMIN?:string;
};
export const config = env as unknown as Config;
export const db = () => config.DB;
export const now = () => Math.floor(Date.now() / 1000);
export const token = () => base64url(crypto.getRandomValues(new Uint8Array(32)));
export const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
export const digest = async (value: string) => base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
export const origin = (req: Request) => config.APP_ORIGIN || new URL(req.url).origin;
export const cookie = (req: Request, key: string) => req.headers.get("cookie")?.split(";").map(x=>x.trim()).find(x=>x.startsWith(key+"="))?.slice(key.length+1) || "";
export function localDevelopment(req?:Request) {
  if(config.ENVIRONMENT!=="development"||config.LOCAL_DEV_AUTH!=="1")return false;
  try {
    const url=new URL(config.APP_ORIGIN??"");
    return url.protocol==="http:"&&["localhost","127.0.0.1","[::1]"].includes(url.hostname)&&(!req||new URL(req.url).origin===url.origin);
  } catch {return false;}
}
export const cookieHeader = (name: string, value: string, age: number) => `${name}=${value}; Max-Age=${age}; Path=/; HttpOnly;${localDevelopment()?"":" Secure;"} SameSite=Lax`;
export const json = (data: unknown, status = 200, headers: HeadersInit = {}) => Response.json(data,{status,headers:{"Cache-Control":"no-store",...headers}});
export const failure = (code: string,status=400) => json({error:code},status);
export function redirectTo(req: Request, path: string, cookies: string[] = []) {
  const headers = new Headers({Location:new URL(path,origin(req)).href,"Cache-Control":"no-store","Referrer-Policy":"no-referrer"});
  for (const value of cookies) headers.append("Set-Cookie",value);
  return new Response(null,{status:303,headers});
}
export async function currentUser(req: Request) {
  const platform = config.TRUST_SITE_AUTH==="1" ? await getChatGPTUser() : null;
  if (platform) {
    const id="site:"+platform.userId;
    if(!await db().prepare("SELECT user_id FROM deleted_accounts WHERE user_id=?").bind(id).first())return id;
  }
  const session = cookie(req,"ta_session");
  if (!/^[A-Za-z0-9_-]{43}$/.test(session)) return null;
  const row = await db().prepare("SELECT user_id FROM sessions WHERE id=? AND expires>unixepoch() AND NOT EXISTS(SELECT 1 FROM deleted_accounts d WHERE d.user_id=sessions.user_id)").bind(await digest(session)).first<{user_id:string}>();
  return row?.user_id ?? null;
}

// Only server-resolved identities may be passed here. Public nicknames grant no access.
export async function isAdministrator(userId?:string|null) {
  if(config.TRUST_SITE_AUTH==="1") {
    const platform=await getChatGPTUser();
    const expected=config.TUNE_ADMIN_EMAIL?.trim().toLowerCase();
    if(platform&&expected&&platform.email.trim().toLowerCase()===expected) {
      const id="site:"+platform.userId;
      if(userId!==undefined&&userId!==id)return false;
      return !await db().prepare("SELECT user_id FROM deleted_accounts WHERE user_id=?").bind(id).first();
    }
  }
  if(userId===undefined) {
    const {headers}=await import("next/headers");
    userId=await currentUser(new Request(new URL("/",config.APP_ORIGIN??"https://internal.invalid"),{headers:await headers()}));
  }
  if(!userId||await db().prepare("SELECT user_id FROM deleted_accounts WHERE user_id=?").bind(userId).first())return false;
  if(localDevelopment()&&config.LOCAL_DEV_ADMIN==="1"&&await db().prepare("SELECT user_id FROM identities WHERE provider='dev' AND subject=? AND user_id=?").bind(await digest("dev:local-driver"),userId).first())return true;
  for(const id of administratorTelegramIds(config.TUNE_ADMIN_TELEGRAM_IDS,config.TUNE_ADMIN_TELEGRAM_ID)) {
    if(await db().prepare("SELECT user_id FROM identities WHERE provider='telegram' AND subject=? AND user_id=?").bind(await digest("telegram:"+id),userId).first())return true;
  }
  return false;
}
