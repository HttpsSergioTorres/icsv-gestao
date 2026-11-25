import { redirect } from "next/navigation";
import { GestaoVinculos } from "@/components/kids-guardian";
import { getUser } from "@/lib/server/auth";
import "@/components/gestao.css";

export default async function ResponsavelPage() {
  const actor = await getUser();
  if (!actor || actor.grants.has("kids:play")) redirect("/selecionar-perfil");
  return <GestaoVinculos />;
}
