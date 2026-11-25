"use client";

import { ArrowRight, Building2, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { api, ApiError, messageOf, write, type SessionUser } from "./client-api";
import { Marca } from "./marca";

type Profile = { id: string; nome: string; congregacao: string; selected: boolean };

export function EscolherPerfil() {
  const [profiles, setProfiles] = useState<Profile[]>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    api<{ profiles: Profile[] }>("/api/auth/profile", { signal: controller.signal })
      .then(({ profiles }) => { if (!controller.signal.aborted) setProfiles(profiles); })
      .catch((failure: unknown) => {
        if (controller.signal.aborted) return;
        if (failure instanceof ApiError && failure.status === 401) window.location.replace("/login");
        else setError(messageOf(failure));
      });
    return () => controller.abort();
  }, [attempt]);
  async function choose(assignmentId: string) {
    setBusy(true);
    setError("");
    try {
      const { user } = await api<{ user: SessionUser }>("/api/auth/profile", write("POST", { assignmentId }));
      window.location.replace(user.home);
    } catch (failure) {
      setError(messageOf(failure)); setBusy(false);
      setAttempt((attempt) => attempt + 1);
    }
  }
  async function signOut() {
    try {
      await api("/api/auth/logout", { method: "POST" });
      window.location.replace("/login");
    } catch (failure) { setError(messageOf(failure)); }
  }
  return <main className="initial-state"><Marca /><section className="auth-card" aria-labelledby="profile-title">
    <span className="auth-mark"><ShieldCheck size={22} aria-hidden="true" /></span>
    <h1 id="profile-title">Escolha seu perfil</h1>
    <p>Selecione como deseja acessar o ICSV Gestão nesta sessão.</p>
    {!profiles && !error && <p role="status">Carregando perfis…</p>}
    {profiles?.length === 0 && <p role="status">Sua conta ainda não tem um acesso disponível. Procure a administração da ICSV San Vale.</p>}
    {profiles?.map((profile) => <button className="btn btn-secondary auth-submit" key={profile.id}
      disabled={busy} type="button" onClick={() => choose(profile.id)}>
      <Building2 size={18} aria-hidden="true" />
      <span><strong>{profile.nome}</strong><br />{profile.congregacao}{profile.selected ? " · Em uso" : ""}</span>
      <ArrowRight size={16} aria-hidden="true" />
    </button>)}
    {error && <p role="alert" className="alert">{error}</p>}
    {error && !profiles && <button className="btn btn-secondary" type="button" onClick={() => { setError(""); setAttempt(attempt + 1); }}>Tentar novamente</button>}
    <button className="btn btn-secondary auth-submit" type="button" onClick={signOut}>Sair</button>
  </section></main>;
}
