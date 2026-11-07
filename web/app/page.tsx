import { headers } from "next/headers";
import Arena from "./arena";
import { detectLanguage } from "@/lib/locale";

export const dynamic = "force-dynamic";
export default async function Page() {
  const h=await headers();
  return <Arena initialLanguage={detectLanguage(h.get("cf-ipcountry"),h.get("accept-language"))}/>;
}
