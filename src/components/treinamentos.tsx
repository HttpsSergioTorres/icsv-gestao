"use client";

import { BookOpen, ExternalLink, GraduationCap, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { TrainingCatalog, TrainingDetail, TrainingProgress } from "@/lib/server/training-types";
import { api, formatDateTime, messageOf, write } from "./client-api";
import { useSession } from "./gestao-shell";
import { PageHeading } from "./painel";
import { CourseForm } from "./treinamentos-form";

const percent = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
const progressLabels: Record<TrainingProgress["status"], string> = {
  nao_iniciado: "Não iniciado",
  em_andamento: "Em andamento",
  aprovado: "Questionário aprovado",
  nao_concluido: "Não concluído",
  concluido: "Concluído",
};

export function TrainingCourses({ initialMinistry }: { initialMinistry?: string }) {
  const user = useSession();
  const router = useRouter();
  const [catalog, setCatalog] = useState<TrainingCatalog | null>(null);
  const [ministry, setMinistry] = useState(initialMinistry ?? "");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const abort = new AbortController();
    api<TrainingCatalog>("/api/treinamentos", { signal: abort.signal })
      .then(setCatalog)
      .catch((failure) => { if (!abort.signal.aborted) setError(messageOf(failure)); });
    return () => abort.abort();
  }, [user.id, user.profileId, user.congregacaoId]);

  const displayed = (catalog?.courses ?? []).filter(({ ministerioId }) => !ministry || ministerioId === ministry);
  const groups = Array.from(new Map(displayed.map(({ ministerioId, ministerio }) => [ministerioId, ministerio])));
  return <>
    <PageHeading title="Treinamentos" description="Cursos dos ministérios da ICSV San Vale." />
    {error && <p className="alert" role="alert">{error}</p>}
    {!catalog && !error && <p role="status">Carregando cursos…</p>}
    {catalog && <div className="training-layout">
      <div className="training-actions training-toolbar">
        {catalog.ministries.length > 0 && <label>Ministério
          <select value={ministry} onChange={(event) => setMinistry(event.target.value)}>
            <option value="">Todos os ministérios</option>
            {catalog.ministries.map(({ id, nome }) => <option value={id} key={id}>{nome}</option>)}
          </select>
        </label>}
        {catalog.canManage && catalog.ministries.length > 0 && !adding &&
          <button className="btn btn-primary" type="button" onClick={() => setAdding(true)}><Plus size={17} aria-hidden />Novo curso</button>}
      </div>
      {adding && <CourseForm ministries={catalog.ministries} ministry={catalog.ministries.some(({ id }) => id === ministry) ? ministry : undefined}
        onSaved={(id) => router.push(`/treinamentos/${id}`)} onCancel={() => setAdding(false)} />}
      {!displayed.length && <div className="training-panel">
        <p>{catalog.canManage ? "Nenhum curso neste ministério." : "Nenhum curso publicado para suas equipes."}</p>
      </div>}
      {groups.map(([id, name]) => <section className="training-group" key={id} aria-labelledby={`training-ministry-${id}`}>
        <h2 id={`training-ministry-${id}`}>{name}</h2>
        <div className="training-cards">
          {displayed.filter(({ ministerioId }) => id === ministerioId).map((course) =>
            <article className="training-panel training-card" key={course.id}>
              <BookOpen size={24} aria-hidden="true" />
              <h3><Link href={`/treinamentos/${course.id}`}>{course.titulo}</Link></h3>
              {course.descricao && <p>{course.descricao}</p>}
              {catalog.canManage && <span className="training-badge">{course.publicado ? "Publicado" : "Rascunho"}</span>}
            </article>
          )}
        </div>
      </section>)}
    </div>}
  </>;
}

export function TrainingCourse({ id }: { id: string }) {
  const user = useSession();
  const endpoint = `/api/treinamentos/${id}`;
  const [detail, setDetail] = useState<TrainingDetail | null>(null);
  const [loadingError, setLoadingError] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const submission = useRef<{ key: string; id: string } | null>(null);

  useEffect(() => {
    const abort = new AbortController();
    api<TrainingDetail>(endpoint, { signal: abort.signal })
      .then(setDetail)
      .catch((failure) => { if (!abort.signal.aborted) setLoadingError(messageOf(failure)); });
    return () => abort.abort();
  }, [endpoint, user.id, user.profileId, user.congregacaoId]);

  if (loadingError) return <><PageHeading title="Treinamento" /><p className="alert" role="alert">{loadingError}</p><Link href="/treinamentos">Voltar aos treinamentos</Link></>;
  if (!detail) return <><PageHeading title="Treinamento" /><p role="status">Carregando curso…</p></>;

  const { course, progresso } = detail;
  const required = course.aulas.filter(({ obrigatoria }) => obrigatoria);
  const requiredDone = required.filter(({ id }) => progresso?.aulasConcluidas.includes(id)).length;
  const certificate = progresso?.certificado;

  async function action(payload: unknown, completed: (result: TrainingProgress) => void) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api<{ progresso: TrainingProgress }>(endpoint, write("POST", payload));
      setDetail((current) => current ? { ...current, progresso: result.progresso } : current);
      completed(result.progresso);
    } catch (failure) {
      setError(messageOf(failure, "Não foi possível atualizar o curso."));
    } finally {
      setBusy(false);
    }
  }

  async function quiz(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const respostas = course.questoes.map(({ id }) => ({ questaoId: id, opcao: answers[id] }));
    if (respostas.some(({ opcao }) => opcao === undefined)) {
      setError("Responda a todas as perguntas.");
      return;
    }
    const key = JSON.stringify(respostas);
    if (submission.current?.key !== key) submission.current = { key, id: crypto.randomUUID() };
    await action({ acao: "enviar-questionario", envioId: submission.current.id, respostas }, (result) => {
      const latest = result.tentativas.at(-1);
      setMessage(latest ? `Questionário registrado. Nota: ${percent.format(latest.nota)}%.` : "Questionário registrado.");
      setAnswers({});
      submission.current = null;
    });
  }

  return <div className="training-layout">
    <Link className="training-back" href={`/treinamentos?ministerioId=${course.ministerioId}`}>← Treinamentos de {course.ministerio}</Link>
    <PageHeading title={course.titulo} description={course.descricao} />
    {course.podeGerenciar && !editing && <div><button className="btn" type="button" onClick={() => setEditing(true)}>Editar curso</button></div>}
    {editing && <CourseForm ministries={[]} initial={course} onCancel={() => setEditing(false)} onSaved={async () => {
      setDetail(await api<TrainingDetail>(endpoint));
      setEditing(false);
      setMessage("Curso atualizado.");
    }} />}
    {progresso && <section className="training-panel" aria-labelledby="training-progress-title">
      <h2 id="training-progress-title">Seu progresso</h2>
      <div className="training-overview">
        <span className="training-badge">{progressLabels[progresso.status]}</span>
        <span>{requiredDone} de {required.length} aulas obrigatórias concluídas</span>
        <span>{progresso.tentativasRestantes} {progresso.tentativasRestantes === 1 ? "tentativa disponível" : "tentativas disponíveis"}</span>
      </div>
      {required.length > 0 && <progress aria-label="Aulas obrigatórias concluídas" max={required.length} value={requiredDone} />}
    </section>}
    {certificate && <article className="training-panel training-certificate" aria-labelledby="training-certificate-title">
      <GraduationCap size={36} aria-hidden />
      <h2 id="training-certificate-title">Certificado de conclusão</h2>
      <dl>
        <div><dt>Voluntário</dt><dd>{certificate.nome}</dd></div>
        <div><dt>Curso</dt><dd>{certificate.curso}</dd></div>
        <div><dt>Ministério</dt><dd>{certificate.ministerio}</dd></div>
        <div><dt>Data de conclusão</dt><dd>{formatDateTime(certificate.emitidoEm)}</dd></div>
      </dl>
      <button className="btn" type="button" onClick={() => window.print()}>Imprimir certificado</button>
    </article>}
    <section className="training-group" aria-labelledby="training-lessons-title">
      <h2 id="training-lessons-title">Aulas</h2>
      <div className="training-cards">
        {course.aulas.map((lesson) => {
          const complete = progresso?.aulasConcluidas.includes(lesson.id);
          return <article className="training-panel training-card" key={lesson.id}>
            <h3>{lesson.titulo}</h3>
            <p className="training-subtitle">{lesson.obrigatoria ? "Obrigatória" : "Complementar"}</p>
            {lesson.conteudo && <p className="training-copy">{lesson.conteudo}</p>}
            {lesson.videoUrl && <a href={lesson.videoUrl} target="_blank" rel="noreferrer" className="training-video">Abrir vídeo gravado <ExternalLink size={16} aria-hidden /></a>}
            {progresso && (complete ? <span className="training-badge">Aula concluída</span> :
              <button className="btn" type="button" disabled={busy} onClick={() =>
                action({ acao: "concluir-aula", aulaId: lesson.id }, () => setMessage("Aula concluída."))
              }>Concluir aula</button>)}
          </article>;
        })}
      </div>
    </section>
    <section className="training-panel" aria-labelledby="training-quiz-title">
      <h2 id="training-quiz-title">Questionário</h2>
      <p>Nota mínima: {course.notaMinima}%.</p>
      {!progresso && <p>{course.questoes.length} {course.questoes.length === 1 ? "pergunta configurada" : "perguntas configuradas"}.</p>}
      {progresso && progresso.tentativasRestantes > 0 && <form className="training-form" onSubmit={quiz}>
        {course.questoes.map(({ id, enunciado, opcoes }) => <fieldset className="training-fieldset" key={id}>
          <legend>{enunciado}</legend>
          {opcoes.map((option, position) => <label className="training-check" key={position}>
            <input type="radio" name={id} checked={answers[id] === position} required disabled={busy}
              onChange={() => setAnswers((current) => ({ ...current, [id]: position }))} />
            {option}
          </label>)}
        </fieldset>)}
        <button className="btn btn-primary" type="submit" disabled={busy}>Entregar questionário</button>
      </form>}
      {progresso?.status === "aprovado" && <p>Conclua as aulas obrigatórias para receber o certificado.</p>}
      {progresso?.status === "nao_concluido" && <p>Você usou as três tentativas disponíveis.</p>}
      {progresso && progresso.tentativas.length > 0 && <ol className="training-attempts" aria-label="Histórico de tentativas">
        {progresso.tentativas.map(({ ordem, nota, aprovada }) =>
          <li key={ordem}><span>Tentativa {ordem}</span><strong>{percent.format(nota)}% · {aprovada ? "Aprovada" : "Reprovada"}</strong></li>)}
      </ol>}
    </section>
    {error && <p className="alert" role="alert">{error}</p>}
    {message && <p className="alert" role="status">{message}</p>}
  </div>;
}
