import { redirect } from "next/navigation";
import { EspacoKids } from "@/components/kids-play";
import { getUser } from "@/lib/server/auth";

export default async function KidsPage() {
  const actor = await getUser();
  if (!actor?.grants.has("kids:play")) redirect("/selecionar-perfil");
  return <EspacoKids />;
}
