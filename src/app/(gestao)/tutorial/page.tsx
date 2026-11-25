import type { Metadata } from "next";
import { AccessDenied } from "@/components/gestao-shell";
import { Tutorial } from "@/components/tutorial";
import { getUser } from "@/lib/server/auth";
import "@/components/tutorial.css";

export const metadata: Metadata = { title: "Tutorial do Sistema" };

export default async function TutorialPage() {
  const actor = await getUser();
  if (!actor?.grants.has("tutorial:read")) return <AccessDenied />;

  return <Tutorial canUseCommunications={actor.grants.has("communications:use")} />;
}
