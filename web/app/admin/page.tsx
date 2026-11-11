import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { detectLanguage } from "@/lib/locale";
import { currentUser } from "@/lib/worker";
import { staffAccess } from "@/lib/access";
import AdminPanel from "../admin-panel";

export const dynamic = "force-dynamic";
export const metadata={title:"Tune Arena · Race Control"};

export default async function AdminPage() {
  const h=await headers();
  const user=await currentUser(new Request("https://internal.invalid/",{headers:h}));
  const access=await staffAccess(user);
  if (access.role==="participant") redirect("/");
  return <AdminPanel initialAccess={access} initialLanguage={detectLanguage(h.get("cf-ipcountry"),h.get("accept-language"))}/>;
}
