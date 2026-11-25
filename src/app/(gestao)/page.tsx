import { redirect } from "next/navigation";
import { ComunicacaoHome } from "@/components/comunicacao";
import { Painel } from "@/components/painel";
import { profileHome } from "@/lib/domain/access";
import { getUser } from "@/lib/server/auth";

export default async function DashboardPage() {
  const actor = await getUser();
  if (actor && profileHome(actor.grants) !== "/") redirect(profileHome(actor.grants));
  return <><Painel />{actor?.grants.has("communications:use") && <ComunicacaoHome />}</>;
}
