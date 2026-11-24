"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { KeyRound, UserRound } from "lucide-react";
import { api, ApiError, messageOf, write } from "./client-api";
import { useSession } from "./gestao-shell";
import { PageHeading } from "./painel";

export function MinhaConta() {
  const user = useSession();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError("");
    const form = event.currentTarget;
    const values = new FormData(form);
    const currentPassword = values.get("senha-atual");
    const newPassword = values.get("senha-nova");
    if (newPassword !== values.get("senha-confirmacao")) {
      setError("Digite a mesma senha nos dois campos.");
      return;
    }
    setBusy(true);
    try {
      await api("/api/auth/password", write("POST", { currentPassword, newPassword }));
      form.reset();
      router.replace("/login?senha=alterada");
      router.refresh();
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 401) {
        form.reset();
        router.replace("/login");
        router.refresh();
        return;
      }
      setError(messageOf(failure, "Não foi possível alterar a senha."));
      setBusy(false);
    }
  }

  return <>
    <PageHeading title="Minha conta" />
    <div className="account-panels">
      <section className="account-card" aria-labelledby="account-details">
        <h2 id="account-details"><UserRound size={19} aria-hidden="true" />Dados da conta</h2>
        <dl className="account-details">
          <div><dt>Nome</dt><dd>{user.name}</dd></div>
          <div><dt>E-mail</dt><dd>{user.email}</dd></div>
          <div><dt>Perfil</dt><dd>{user.role}</dd></div>
        </dl>
      </section>
      <section className="account-card" aria-labelledby="account-password">
        <h2 id="account-password"><KeyRound size={19} aria-hidden="true" />Segurança</h2>
        <p id="account-password-hint">A nova senha deve ter pelo menos 8 caracteres. A alteração encerra o acesso em todos os dispositivos.</p>
        <form className="account-form" onSubmit={submit}>
          <label htmlFor="account-current">Senha atual</label>
          <input id="account-current" name="senha-atual" type="password" autoComplete="current-password" maxLength={128} required />
          <label htmlFor="account-new">Nova senha</label>
          <input id="account-new" name="senha-nova" type="password" autoComplete="new-password"
            aria-describedby="account-password-hint" minLength={8} maxLength={128} required />
          <label htmlFor="account-confirm">Confirmar nova senha</label>
          <input id="account-confirm" name="senha-confirmacao" type="password" autoComplete="new-password" minLength={8} maxLength={128} required />
          {error && <p className="alert" role="alert">{error}</p>}
          <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Alterando…" : "Alterar senha"}</button>
        </form>
      </section>
    </div>
  </>;
}
