import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { detectLanguage } from "@/lib/locale";
import UploadPanel from "../upload-panel";

export const dynamic="force-dynamic";
export const metadata={title:"Tune Arena · Photo upload"};
export default async function UploadPage({params,searchParams}:{params:Promise<{kind:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const {kind}=await params;if(kind!=="avatar"&&kind!=="entry")notFound();
  const query=await searchParams,requested=typeof query.round==="string"?query.round:"";
  const roundId=/^[a-zA-Z0-9-]{1,70}$/.test(requested)?requested:undefined;
  const h=await headers();
  return <UploadPanel kind={kind} roundId={roundId} initialLanguage={detectLanguage(h.get("cf-ipcountry"),h.get("accept-language"))}/>;
}
