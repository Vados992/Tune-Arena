import { redirect } from "next/navigation";
import { isAdministrator } from "@/lib/worker";
import BusinessPanel from "./business-panel";

export const dynamic="force-dynamic";
export default async function BusinessPage() {
  if (!await isAdministrator()) redirect("/");
  return <BusinessPanel/>;
}
