import { headers } from "next/headers";
import { detectLanguage } from "@/lib/locale";
import InstallClient from "./install-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Install Tune Arena", description: "Install Tune Arena on iPhone, Android, Windows and Mac." };

export default async function InstallPage() {
  const h = await headers();
  return <InstallClient initialLanguage={detectLanguage(h.get("cf-ipcountry"), h.get("accept-language"))}/>;
}
