import { headers } from "next/headers";
import { detectLanguage } from "@/lib/locale";
import WinnersPanel from "./winners-panel";

export const dynamic = "force-dynamic";
export const metadata={title:"Tune Arena · Winners"};

export default async function WinnersPage() {
  const h=await headers();
  return <WinnersPanel initialLanguage={detectLanguage(h.get("cf-ipcountry"),h.get("accept-language"))}/>;
}
