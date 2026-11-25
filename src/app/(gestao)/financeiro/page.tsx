import { redirect } from "next/navigation";
import { getUser } from "@/lib/server/auth";

export default async function FinanceiroIndex() {
  const actor = await getUser();
  redirect(actor?.grants.has("finance:manage") ? "/financeiro/painel" : "/financeiro/relatorios");
}
