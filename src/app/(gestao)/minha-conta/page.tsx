import type { Metadata } from "next";
import { MinhaConta } from "@/components/minha-conta";
import "@/components/minha-conta.css";

export const metadata: Metadata = { title: "Minha conta" };

export default function MinhaContaPage() {
  return <MinhaConta />;
}
