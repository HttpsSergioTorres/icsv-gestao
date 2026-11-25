import { redirect } from "next/navigation";
import { AdministracaoKids } from "@/components/kids-guardian";
import { getUser } from "@/lib/server/auth";

export default async function KidsAdminPage() {
  const actor = await getUser();
  if (!actor) redirect("/selecionar-perfil");
  if (!actor.grants.has("kids:manage")) return <section className="state-card"><h1>Acesso restrito</h1>
    <p>Seu perfil não pode administrar os vínculos Kids.</p></section>;
  return <AdministracaoKids />;
}
