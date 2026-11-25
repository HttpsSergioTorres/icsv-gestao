import type { Metadata } from "next";
import { TrainingCourses } from "@/components/treinamentos";
import "@/components/treinamentos.css";

export const metadata: Metadata = { title: "Treinamentos" };

export default async function TreinamentosPage({
  searchParams,
}: { searchParams: Promise<{ ministerioId?: string | string[] }> }) {
  const { ministerioId } = await searchParams;
  return <TrainingCourses initialMinistry={typeof ministerioId === "string" ? ministerioId : undefined} />;
}
