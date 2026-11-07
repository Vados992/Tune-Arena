import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { detectLanguage } from "@/lib/locale";
import { isAdministrator } from "@/lib/worker";
import AdminPanel from "../admin-panel";

export const dynamic = "force-dynamic";
export const metadata={title:"Tune Arena · Race Control"};

export default async function AdminPage() {
  if (!await isAdministrator()) redirect("/");
  const h=await headers();
  return <AdminPanel initialLanguage={detectLanguage(h.get("cf-ipcountry"),h.get("accept-language"))}/>;
}
