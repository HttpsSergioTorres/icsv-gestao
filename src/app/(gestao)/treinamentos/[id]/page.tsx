import type { Metadata } from "next";
import { TrainingCourse } from "@/components/treinamentos";
import "@/components/treinamentos.css";

export const metadata: Metadata = { title: "Curso de voluntariado" };

export default async function TreinamentoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TrainingCourse id={id} />;
}
