import {currentUser} from "@/lib/worker";
import { headers } from "next/headers";
import Arena from "./arena";
import Welcome from "./welcome";
import { detectLanguage } from "@/lib/locale";

export const dynamic = "force-dynamic";
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const h=await headers();
  const query=await searchParams;
  const signedIn=await currentUser(new Request("https://tune-arena.local",{headers:new Headers(h)}));
  if(!signedIn&&(!Object.keys(query).length||query.register||query.provider_unavailable||query.deleted))return <Welcome locale={detectLanguage(h.get("cf-ipcountry"),h.get("accept-language"))}/>;
  return <Arena initialLanguage={detectLanguage(h.get("cf-ipcountry"),h.get("accept-language"))}/>;
}
