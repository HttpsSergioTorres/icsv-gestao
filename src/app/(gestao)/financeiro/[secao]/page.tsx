import { notFound } from "next/navigation";
import { Financeiro } from "@/components/financeiro";
import { AccessDenied } from "@/components/gestao-shell";
import { financeSection } from "@/lib/domain/finance";
import { getUser } from "@/lib/server/auth";
import { canViewFinance } from "@/lib/server/finance";
import "@/components/financeiro.css";

export default async function FinanceiroPage({ params }: { params: Promise<{ secao: string }> }) {
  const section = financeSection((await params).secao);
  if (!section) notFound();

  const actor = await getUser();
  if (!actor || !canViewFinance(actor, section.slug)) return <AccessDenied />;

  return <Financeiro section={section.slug} canManage={actor.grants.has("finance:manage")} />;
}
