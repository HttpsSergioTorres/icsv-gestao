"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, BadgeCheck, Link2, LogOut, ShieldCheck } from "lucide-react";
import { api, formatDateTime, messageOf, write } from "./client-api";
import { Marca } from "./marca";
import "./kids.css";

export function PortalFrame({ children, titulo, description, back }: {
  children: ReactNode; titulo: string; description?: string;
  back?: { href: string; label: string };
}) {
  return <main className="kids-portal">
    <div className="kids-portal-brand"><Marca /></div>
    <section className="kids-paper">
      <div className="kids-paper-header">
        {back && <Link className="text-link" href={back.href}><ArrowLeft size={16} aria-hidden="true" />{back.label}</Link>}
        <h1>{titulo}</h1>
        {description && <p>{description}</p>}
      </div>
      {children}
    </section>
  </main>;
}

export function CadastroResponsavel() {
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await api("/api/kids/cadastro", write("POST", {
        nome: form.get("nome"), email: form.get("email"), senha: form.get("senha"),
      }));
      setDone(true);
    } catch (failure) {
      setError(messageOf(failure, "Não foi possível criar a conta."));
    } finally {
      setBusy(false);
    }
  }

  return <PortalFrame titulo="Cadastro de responsável" back={{ href: "/login", label: "Voltar ao login" }}
    description="Se você já tem uma conta na ICSV, entre com ela para solicitar o vínculo.">
    {done
      ? <div className="kids-form"><p className="kids-success" role="status">Conta criada. Entre e escolha o perfil Responsável.</p>
        <Link className="btn btn-primary" href="/login">Entrar</Link></div>
      : <form className="kids-form" onSubmit={register}>
        <label>Nome completo<input name="nome" autoComplete="name" minLength={2} maxLength={200} required /></label>
        <label>E-mail<input name="email" type="email" autoComplete="email" maxLength={254} required /></label>
        <label>Senha<input name="senha" type="password" autoComplete="new-password" minLength={8} maxLength={128} required /></label>
        <p className="kids-muted">Use de 8 a 128 caracteres. Peça à administração o código de vínculo da criança.</p>
        {error && <p className="kids-alert" role="alert">{error}</p>}
        <button className="btn btn-primary" disabled={busy} type="submit">{busy ? "Criando conta…" : "Criar conta de responsável"}</button>
      </form>}
  </PortalFrame>;
}

type LinkItem = {
  id: string; status: string; crianca: string | null; solicitadoEm: string; aceiteEm: string | null; habilitado: boolean;
};
type MyLinks = { termo: { versao: string; texto: string; demo: boolean } | null; vinculos: LinkItem[] };
const statusLabels: Record<string, string> = {
  pendente: "Aguardando confirmação", confirmado: "Confirmado", rejeitado: "Não confirmado", revogado: "Encerrado",
};

export function GestaoVinculos() {
  const [data, setData] = useState<MyLinks>();
  const [attempt, setAttempt] = useState(0);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [signing, setSigning] = useState<string>();

  useEffect(() => {
    const controller = new AbortController();
    api<MyLinks>("/api/kids/vinculos", { signal: controller.signal })
      .then(setData).catch((error: unknown) => { if (!controller.signal.aborted) setError(messageOf(error)); });
    return () => controller.abort();
  }, [attempt]);

  async function run(action: () => Promise<unknown>, success: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      setNotice(success);
      setAttempt((value) => value + 1);
    } catch (error) {
      setError(messageOf(error));
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await run(async () => {
      await api("/api/auth/logout", { method: "POST" });
      window.location.assign("/login");
    }, "");
  }

  function requestLink(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void run(async () => {
      await api("/api/kids/vinculos", write("POST", { codigo: code }));
      setCode("");
    }, "Solicitação enviada. A administração confirmará o vínculo.");
  }

  return <PortalFrame titulo="Vínculos Kids"
    description="Solicite o vínculo com o código fornecido pela administração da ICSV."
    back={{ href: "/selecionar-perfil", label: "Trocar perfil" }}>
    <div className="kids-portal-actions"><button type="button" className="text-link" onClick={logout} disabled={busy}><LogOut size={16} aria-hidden="true" />Sair</button></div>
    <form className="kids-form kids-invite-form" onSubmit={requestLink}>
      <label>Código de vínculo<input value={code} onChange={(event) => setCode(event.target.value)} required
        autoComplete="off" autoCapitalize="off" spellCheck={false} maxLength={48} /></label>
      <button className="btn btn-primary" disabled={busy} type="submit"><Link2 size={17} aria-hidden="true" />Solicitar vínculo</button>
    </form>
    {notice && <p className="kids-success" role="status">{notice}</p>}
    {error && <div><p className="kids-alert" role="alert">{error}</p>
      {!data && <button className="btn btn-secondary" type="button" onClick={() => { setError(""); setAttempt((value) => value + 1); }}>Tentar novamente</button>}
    </div>}
    {!data && !error && <p role="status">Carregando vínculos…</p>}
    {data && <section className="kids-links" aria-labelledby="kids-mine">
      <h2 id="kids-mine">Meus vínculos</h2>
      {data.vinculos.length === 0 && <p className="kids-muted">Você ainda não tem vínculos cadastrados.</p>}
      {data.vinculos.map((item) => <article className="kids-link-item" key={item.id}>
        <div className="kids-link-title"><h3>{item.crianca || "Solicitação Kids"}</h3><span className="kids-badge">{statusLabels[item.status]}</span></div>
        <p className="kids-muted">Solicitado em {formatDateTime(item.solicitadoEm)}</p>
        {item.habilitado && <div className="kids-enabled"><BadgeCheck size={16} aria-hidden="true" />
          <span>Acesso Kids liberado · aceite em {formatDateTime(item.aceiteEm)}</span>
          <Link className="text-link" href="/selecionar-perfil">Selecionar Kids</Link>
        </div>}
        {item.status === "confirmado" && item.crianca && !item.habilitado && (
          data.termo ? <form className="kids-term" onSubmit={(event) => {
            event.preventDefault();
            if (signing !== item.id) return;
            void run(async () => {
              await api(`/api/kids/vinculos/${item.id}/aceite`, write("POST", { aceite: true, versao: data.termo?.versao }));
              setSigning(undefined);
            }, "Aceite registrado. O perfil Kids já pode ser selecionado.");
          }}>
            <h4><ShieldCheck size={18} aria-hidden="true" />{data.termo.demo ? "Termo de demonstração" : "Termo de acesso Kids"} · {data.termo.versao}</h4>
            <p>{data.termo.texto}</p>
            <label className="kids-checkbox"><input type="checkbox" checked={signing === item.id}
              onChange={(event) => setSigning(event.target.checked ? item.id : undefined)} /> Li e aceito o termo de acesso Kids</label>
            <button className="btn btn-primary" type="submit" disabled={busy || signing !== item.id}>Registrar aceite</button>
          </form> : <p className="kids-alert">A ICSV ainda precisa configurar o termo aprovado para liberar o acesso Kids.</p>
        )}
        {(item.status === "pendente" || item.status === "confirmado") && <details className="kids-withdraw">
          <summary>Encerrar solicitação ou vínculo</summary>
          <p>Encerrar este vínculo remove a autorização Kids associada.</p>
          <button type="button" className="btn btn-danger" disabled={busy} onClick={() => void run(
            () => api(`/api/kids/vinculos/${item.id}`, { method: "DELETE" }), "Vínculo encerrado.",
          )}>Confirmar encerramento</button>
        </details>}
      </article>)}
    </section>}
  </PortalFrame>;
}

type AdminLink = {
  id: string; crianca: string; responsavel: string; email: string; status: string; proprioVinculo: boolean;
};
type AdminData = { criancas: { id: string; nome: string }[]; vinculos: AdminLink[] };

export function AdministracaoKids() {
  const [data, setData] = useState<AdminData>();
  const [attempt, setAttempt] = useState(0);
  const [child, setChild] = useState("");
  const [invite, setInvite] = useState<{ codigo: string; expiraEm: string }>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    api<AdminData>("/api/kids/administracao", { signal: controller.signal })
      .then(setData).catch((error: unknown) => { if (!controller.signal.aborted) setError(messageOf(error)); });
    return () => controller.abort();
  }, [attempt]);

  async function run(action: () => Promise<unknown>, success: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      setNotice(success);
      setAttempt((value) => value + 1);
    } catch (error) {
      setError(messageOf(error));
    } finally {
      setBusy(false);
    }
  }

  function issue(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void run(async () => {
      const result = await api<{ codigo: string; expiraEm: string }>("/api/kids/convites", write("POST", { criancaId: child }));
      setInvite(result);
    }, "Código de uso único gerado.");
  }

  function review(id: string, acao: "confirmar" | "rejeitar" | "revogar") {
    void run(() => api(`/api/kids/vinculos/${id}`, write("PATCH", { acao })), "Estado do vínculo atualizado.");
  }

  return <div className="kids-admin">
    <header className="module-heading"><div><h1>Vínculos Kids</h1><p>Gere códigos e confirme vínculos após conferir a identidade e a responsabilidade legal.</p></div></header>
    {notice && <p className="kids-success" role="status">{notice}</p>}
    {error && <div><p className="kids-alert" role="alert">{error}</p>
      {!data && <button className="btn btn-secondary" type="button" onClick={() => { setError(""); setAttempt((value) => value + 1); }}>Tentar novamente</button>}
    </div>}
    {!data && !error && <p role="status">Carregando vínculos…</p>}
    {data && <>
      <section className="kids-paper kids-admin-section">
        <h2>Código de vínculo</h2>
        {data.criancas.length
          ? <form className="kids-form kids-invite-form" onSubmit={issue}>
            <label>Criança<select value={child} onChange={(event) => { setChild(event.target.value); setInvite(undefined); }} required>
              <option value="">Selecione</option>
              {data.criancas.map(({ id, nome }) => <option key={id} value={id}>{nome}</option>)}
            </select></label>
            <button type="submit" className="btn btn-primary" disabled={busy}>Gerar código de vínculo</button>
          </form>
          : <p className="kids-muted">Cadastre em Pessoas um menor de idade ativo nesta congregação, com data de nascimento.</p>}
        {invite && <div className="kids-form">
          <label>Código gerado<input readOnly value={invite.codigo} onFocus={(event) => event.currentTarget.select()} /></label>
          <p className="kids-muted">Compartilhe somente com o responsável. Expira em {formatDateTime(invite.expiraEm)}.</p>
        </div>}
      </section>
      <section className="kids-paper kids-admin-section">
        <h2>Solicitações de vínculo</h2>
        {!data.vinculos.length && <p className="kids-muted">Nenhuma solicitação nesta congregação.</p>}
        {data.vinculos.map(({ id, crianca, responsavel, email, status, proprioVinculo }) => <article className="kids-link-item" key={id}>
          <div className="kids-link-title"><h3>{crianca}</h3><span className="kids-badge">{statusLabels[status]}</span></div>
          <p>{responsavel} · {email}</p>
          <div className="kids-actions">
            {status === "pendente" && !proprioVinculo && <button type="button" className="btn btn-primary" disabled={busy} onClick={() => review(id, "confirmar")}>Confirmar vínculo</button>}
            {status === "pendente" && <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => review(id, "rejeitar")}>Rejeitar vínculo</button>}
            {status === "confirmado" && <button type="button" className="btn btn-danger" disabled={busy} onClick={() => review(id, "revogar")}>Encerrar vínculo</button>}
          </div>
        </article>)}
      </section>
    </>}
  </div>;
}
