"use client";

import { useState, type FormEvent } from "react";
import type { TrainingDetail, TrainingLesson, TrainingQuestion } from "@/lib/server/training-types";
import { api, messageOf, write } from "./client-api";

type LessonDraft = Omit<TrainingLesson, "id"> & { id?: string };
type QuestionDraft = Omit<TrainingQuestion, "id" | "opcoes"> & { id?: string; options: string; gabarito: string };
const emptyLesson: LessonDraft = { titulo: "", conteudo: "", videoUrl: "", obrigatoria: true };
const emptyQuestion: QuestionDraft = { enunciado: "", options: "", gabarito: "" };

export function CourseForm({ ministries, initial, onSaved, onCancel, ministry }: {
  ministries: { id: string; nome: string }[];
  initial?: TrainingDetail["course"];
  onSaved: (id: string) => void | Promise<void>;
  onCancel: () => void;
  ministry?: string;
}) {
  const [title, setTitle] = useState(initial?.titulo ?? "");
  const [description, setDescription] = useState(initial?.descricao ?? "");
  const [ministryId, setMinistryId] = useState(ministry ?? ministries[0]?.id ?? "");
  const [minimum, setMinimum] = useState(String(initial?.notaMinima ?? 70));
  const [published, setPublished] = useState(initial?.publicado ?? false);
  const [lessons, setLessons] = useState<LessonDraft[]>(initial?.aulas ?? [emptyLesson]);
  const [questions, setQuestions] = useState<QuestionDraft[]>(initial?.questoes.map(({ opcoes, ...question }) => ({
    ...question, options: opcoes.join("\n"), gabarito: "",
  })) ?? [emptyQuestion]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function setLesson(index: number, values: Partial<LessonDraft>) {
    setLessons((current) => current.map((lesson, position) => position === index ? { ...lesson, ...values } : lesson));
  }

  function setQuestion(index: number, values: Partial<QuestionDraft>) {
    setQuestions((current) => current.map((question, position) => position === index ? { ...question, ...values } : question));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const data = { titulo: title, descricao: description, publicado: published };
      const content = initial?.conteudoBloqueado ? {} : {
        notaMinima: Number(minimum),
        aulas: lessons.map(({ videoUrl, ...lesson }) => ({ ...lesson, videoUrl: videoUrl?.trim() || undefined })),
        questoes: questions.map(({ options, gabarito, ...question }) => ({
          ...question,
          opcoes: options.split("\n").map((option) => option.trim()).filter(Boolean),
          gabarito: gabarito ? Number(gabarito) - 1 : undefined,
        })),
      };
      if (initial) {
        await api(`/api/treinamentos/${initial.id}`, write("PATCH", { ...data, ...content }));
        await onSaved(initial.id);
      } else {
        const { id } = await api<{ id: string }>("/api/treinamentos", write("POST", { ...data, ...content, ministerioId: ministryId }));
        await onSaved(id);
      }
    } catch (failure) {
      setError(messageOf(failure, "Não foi possível salvar o curso."));
    } finally {
      setBusy(false);
    }
  }

  return <section className="training-panel" aria-labelledby="training-form-title">
    <h2 id="training-form-title">{initial ? "Editar curso" : "Novo curso"}</h2>
    {initial?.conteudoBloqueado && <p>Já há progresso neste curso. Crie outro para alterar aulas, questões ou nota mínima.</p>}
    <form className="training-form" onSubmit={submit}>
      {!initial && <label>Ministério
        <select value={ministryId} onChange={(event) => setMinistryId(event.target.value)} required>
          {ministries.map(({ id, nome }) => <option key={id} value={id}>{nome}</option>)}
        </select>
      </label>}
      <label>Título do curso<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={140} required /></label>
      <label>Descrição<textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} rows={3} /></label>
      <label className="training-check"><input type="checkbox" checked={published} onChange={(event) => setPublished(event.target.checked)} />Publicar para a equipe</label>

      {!initial?.conteudoBloqueado && <>
        <label>Nota mínima (%)
          <input type="number" min={1} max={100} value={minimum} onChange={(event) => setMinimum(event.target.value)} required />
        </label>
        <div>
          <h3>Aulas</h3>
          {lessons.map((lesson, index) => <fieldset key={index} className="training-fieldset">
            <legend>Aula {index + 1}</legend>
            <label>Título da aula<input value={lesson.titulo} onChange={(event) => setLesson(index, { titulo: event.target.value })} maxLength={140} required /></label>
            <label>Conteúdo em texto<textarea rows={3} value={lesson.conteudo} onChange={(event) => setLesson(index, { conteudo: event.target.value })} maxLength={2000} /></label>
            <label>Link do vídeo gravado<input type="url" value={lesson.videoUrl ?? ""} onChange={(event) => setLesson(index, { videoUrl: event.target.value })} maxLength={800} /></label>
            <label className="training-check">
              <input type="checkbox" checked={lesson.obrigatoria} onChange={(event) => setLesson(index, { obrigatoria: event.target.checked })} />
              Aula obrigatória para o certificado
            </label>
            {lessons.length > 1 && <button className="btn" type="button" onClick={() => setLessons(lessons.filter((_, i) => i !== index))}>Remover aula</button>}
          </fieldset>)}
          <button className="btn" type="button" onClick={() => setLessons([...lessons, emptyLesson])} disabled={lessons.length >= 20}>Adicionar aula</button>
        </div>
        <div>
          <h3>Questionário</h3>
          {questions.map((question, index) => <fieldset key={index} className="training-fieldset">
            <legend>Pergunta {index + 1}</legend>
            <label>Enunciado<input value={question.enunciado} onChange={(event) => setQuestion(index, { enunciado: event.target.value })} maxLength={300} required /></label>
            <label>Alternativas, uma por linha (de 2 a 5)
              <textarea rows={4} value={question.options} onChange={(event) => setQuestion(index, { options: event.target.value })} required />
            </label>
            <label>Número da alternativa correta
              <input type="number" min={1} max={5} value={question.gabarito}
                placeholder={question.id ? "Manter gabarito salvo" : undefined}
                onChange={(event) => setQuestion(index, { gabarito: event.target.value })} required={!question.id} />
            </label>
            {questions.length > 1 && <button className="btn" type="button" onClick={() => setQuestions(questions.filter((_, i) => i !== index))}>Remover pergunta</button>}
          </fieldset>)}
          <button className="btn" type="button" onClick={() => setQuestions([...questions, emptyQuestion])} disabled={questions.length >= 20}>Adicionar pergunta</button>
        </div>
      </>}

      {error && <p className="alert" role="alert">{error}</p>}
      <div className="training-actions">
        <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Salvando…" : "Salvar curso"}</button>
        <button className="btn" type="button" onClick={onCancel} disabled={busy}>Cancelar</button>
      </div>
    </form>
  </section>;
}
