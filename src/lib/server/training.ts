import { randomUUID } from "node:crypto";
import { type PoolClient } from "pg";
import { z } from "zod";
import { headquarters } from "./access-admin";
import { assertGrant, requireUser, type Actor } from "./auth";
import { database, recordTransaction } from "./db";
import { ApiError } from "./http";
import { recordId } from "./records";
import type {
  TrainingCatalog,
  TrainingDetail,
  TrainingLesson,
  TrainingProgress,
  TrainingQuestion,
  TrainingSummary,
} from "./training-types";

const manageGrant = "training:manage";
const learnGrant = "training:learn";
const maxAttempts = 3;

const idSchema = z.uuid("Selecione um identificador válido.").toLowerCase();
const videoUrlSchema = z.url({ protocol: /^https?$/ })
  .refine((value) => {
    const url = new URL(value);
    return Boolean(url.hostname) && !url.username && !url.password;
  }, "Informe um endereço HTTP ou HTTPS de um vídeo gravado.");

const lessonSchema = z.strictObject({
  id: idSchema.optional(),
  titulo: z.string().trim().min(1, "Informe o título da aula.").max(140),
  conteudo: z.string().trim().max(2_000).default(""),
  videoUrl: videoUrlSchema.max(800).optional(),
  obrigatoria: z.boolean().default(true),
}).refine((lesson) => Boolean(lesson.conteudo || lesson.videoUrl), {
  message: "Inclua conteúdo ou o link de um vídeo na aula.",
});

const questionSchema = z.strictObject({
  id: idSchema.optional(),
  enunciado: z.string().trim().min(1, "Informe o enunciado da questão.").max(300),
  opcoes: z.array(z.string().trim().min(1, "Preencha as alternativas.").max(200)).min(2).max(5),
  gabarito: z.number().int().min(0).max(4).optional(),
});

const courseSchema = z.strictObject({
  titulo: z.string().trim().min(1, "Informe o título do curso.").max(140),
  descricao: z.string().trim().max(1_000).default(""),
  notaMinima: z.number().int().min(1).max(100),
  publicado: z.boolean().default(false),
  aulas: z.array(lessonSchema).min(1, "Adicione pelo menos uma aula.").max(20),
  questoes: z.array(questionSchema).min(1, "Adicione pelo menos uma pergunta.").max(20),
});

const createSchema = courseSchema.extend({ ministerioId: idSchema });
const editSchema = courseSchema.partial().refine((input) => Object.keys(input).length > 0, {
  message: "Envie pelo menos uma alteração.",
});
const actionSchema = z.discriminatedUnion("acao", [
  z.strictObject({ acao: z.literal("concluir-aula"), aulaId: idSchema }),
  z.strictObject({
    acao: z.literal("enviar-questionario"),
    envioId: idSchema,
    respostas: z.array(z.strictObject({
      questaoId: idSchema,
      opcao: z.number().int().min(0).max(4),
    })).min(1).max(20),
  }),
]);

type StoredQuestion = TrainingQuestion & { gabarito: number };
type CourseRow = {
  id: string;
  ministry_id: string;
  ministry_name: string;
  title: string;
  description: string;
  minimum_score: number;
  published: boolean;
  lessons: TrainingLesson[];
  questions: StoredQuestion[];
  eligible: boolean;
  content_locked: boolean;
};
type AttemptRow = {
  submission_id: string;
  ordinal: number;
  score: string;
  passed: boolean;
  submitted_at: Date;
  answers: Record<string, number>;
};
type CertificateRow = {
  id: string;
  person_name: string;
  course_title: string;
  ministry_name: string;
  issued_at: Date;
};
type Connection = Pick<PoolClient, "query">;

async function congregation(actor: Actor, client?: PoolClient) {
  if (actor.congregacaoId) return actor.congregacaoId;
  if (actor.scope === "campo" && actor.grants.has(manageGrant)) return (await headquarters(client)).id;
  throw new ApiError(403, "Selecione uma congregação autorizada para acessar os treinamentos.");
}

async function trainingAccess(actor: Actor, client?: PoolClient) {
  const canManage = actor.grants.has(manageGrant);
  const learner = actor.congregacaoId && actor.grants.has(learnGrant) ? actor.pessoaId ?? null : null;
  if (!canManage && !actor.grants.has(learnGrant)) {
    throw new ApiError(403, "Seu perfil não tem acesso aos treinamentos.");
  }
  return { congregationId: await congregation(actor, client), canManage, learner };
}

const membershipCondition = `
  EXISTS (
    SELECT 1 FROM icsv_records eq
    JOIN icsv_records person ON person.id = $2 AND person.resource = 'pessoas'
      AND person.deleted_at IS NULL AND person.data->>'ativo' = 'true'
      AND person.congregation_id = m.congregation_id
    WHERE eq.resource = 'equipes' AND eq.deleted_at IS NULL AND eq.data->>'ativo' = 'true'
      AND eq.congregation_id = m.congregation_id
      AND eq.data->>'pessoaId' = person.id::text AND eq.data->>'ministerioId' = m.id::text
  )
`;

const ministryScope = `
  m.resource = 'ministerios' AND m.deleted_at IS NULL AND m.congregation_id = $1
`;

function courseSummary(row: CourseRow, canManage: boolean): TrainingSummary {
  return {
    id: row.id,
    ministerioId: row.ministry_id,
    ministerio: row.ministry_name,
    titulo: row.title,
    descricao: row.description,
    notaMinima: row.minimum_score,
    publicado: row.published,
    podeGerenciar: canManage,
    podeAprender: row.eligible && row.published,
  };
}

export async function listTraining(actor: Actor, filter?: string): Promise<TrainingCatalog> {
  const { congregationId, canManage, learner } = await trainingAccess(actor);
  const selected = filter ? recordId(filter) : null;
  const [courses, ministries] = await Promise.all([
    database().query<CourseRow>(`
      SELECT c.id, c.ministry_id, c.title, c.description, c.minimum_score, c.published,
        m.data->>'nome' AS ministry_name,
        (m.data->>'ativo' = 'true' AND ${membershipCondition}) AS eligible
      FROM icsv_training_courses c JOIN icsv_records m ON m.id = c.ministry_id
      WHERE ${ministryScope} AND ($4::uuid IS NULL OR m.id = $4)
        AND ($3::boolean OR (m.data->>'ativo' = 'true' AND c.published AND ${membershipCondition}))
      ORDER BY m.data->>'nome', c.title, c.id
    `, [congregationId, learner, canManage, selected]),
    database().query<{ id: string; nome: string }>(`
      SELECT m.id, m.data->>'nome' AS nome FROM icsv_records m
      WHERE ${ministryScope} AND m.data->>'ativo' = 'true'
        AND ($3::boolean OR ${membershipCondition})
      ORDER BY m.data->>'nome', m.id
    `, [congregationId, learner, canManage]),
  ]);

  return { courses: courses.rows.map((row) => courseSummary(row, canManage)), ministries: ministries.rows, canManage };
}

async function findCourse(actor: Actor, id: string, client?: PoolClient) {
  const { congregationId, canManage, learner } = await trainingAccess(actor, client);
  const { rows } = await (client ?? database()).query<CourseRow>(`
    SELECT c.*, m.data->>'nome' AS ministry_name,
      (m.data->>'ativo' = 'true' AND ${membershipCondition}) AS eligible,
      (EXISTS (SELECT 1 FROM icsv_training_progress WHERE course_id = c.id) OR
       EXISTS (SELECT 1 FROM icsv_training_attempts WHERE course_id = c.id)) AS content_locked
    FROM icsv_training_courses c JOIN icsv_records m ON m.id = c.ministry_id
    WHERE ${ministryScope} AND c.id = $4
      AND ($3::boolean OR (m.data->>'ativo' = 'true' AND c.published AND ${membershipCondition}))
  `, [congregationId, learner, canManage, recordId(id)]);
  if (!rows[0]) throw new ApiError(404, "Curso não encontrado neste ministério.");
  return { row: rows[0], canManage, learner: rows[0].eligible && rows[0].published ? learner : null };
}

function unique<T extends { id: string }>(entries: T[], label: string): T[] {
  if (new Set(entries.map(({ id }) => id)).size !== entries.length) {
    throw new ApiError(400, `Cada ${label} deve aparecer uma única vez.`);
  }
  return entries;
}

function prepareLessons(lessons: z.infer<typeof lessonSchema>[]) {
  return unique(lessons.map((lesson) => ({ ...lesson, id: lesson.id ?? randomUUID() })), "aula");
}

function sameOptions(a: string[], b: string[]) {
  return a.length === b.length && a.every((value, index) => b[index] === value);
}

function prepareQuestions(questions: z.infer<typeof questionSchema>[], previous: StoredQuestion[] = []) {
  return unique(questions.map((question) => {
    const before = previous.find((candidate) => candidate.id === question.id);
    const gabarito = question.gabarito ??
      (before && sameOptions(before.opcoes, question.opcoes) ? before.gabarito : undefined);
    if (gabarito === undefined || gabarito >= question.opcoes.length) {
      throw new ApiError(400, "Indique a alternativa correta de cada pergunta nova ou com alternativas alteradas.");
    }
    return { ...question, gabarito, id: question.id ?? randomUUID() };
  }), "questão");
}

export async function createTraining(input: unknown) {
  const data = createSchema.parse(input);
  return recordTransaction(async (client) => {
    const actor = await requireUser(client);
    assertGrant(actor, manageGrant);
    const { rowCount } = await client.query(`
      SELECT 1 FROM icsv_records m WHERE ${ministryScope} AND m.id = $2 AND m.data->>'ativo' = 'true'
    `, [await congregation(actor, client), data.ministerioId]);
    if (!rowCount) throw new ApiError(404, "Ministério ativo não encontrado nesta congregação.");

    const id = randomUUID();
    await client.query(`
      INSERT INTO icsv_training_courses
        (id, ministry_id, title, description, minimum_score, published, lessons, questions)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [id, data.ministerioId, data.titulo, data.descricao, data.notaMinima, data.publicado,
      JSON.stringify(prepareLessons(data.aulas)), JSON.stringify(prepareQuestions(data.questoes))]);
    return { id };
  });
}

export async function editTraining(id: string, input: unknown) {
  const data = editSchema.parse(input);
  return recordTransaction(async (client) => {
    const actor = await requireUser(client);
    assertGrant(actor, manageGrant);
    const { row } = await findCourse(actor, id, client);
    if (row.content_locked && (data.aulas || data.questoes || data.notaMinima !== undefined)) {
      throw new ApiError(409, "Já há progresso registrado. Crie outro curso para alterar aulas, questionário ou nota mínima.");
    }

    await client.query(`
      UPDATE icsv_training_courses SET title = $2, description = $3, minimum_score = $4,
        published = $5, lessons = $6, questions = $7, updated_at = now()
      WHERE id = $1
    `, [row.id, data.titulo ?? row.title, data.descricao ?? row.description, data.notaMinima ?? row.minimum_score,
      data.publicado ?? row.published, JSON.stringify(data.aulas ? prepareLessons(data.aulas) : row.lessons),
      JSON.stringify(data.questoes ? prepareQuestions(data.questoes, row.questions) : row.questions)]);
  });
}

async function progressState(connection: Connection, row: CourseRow, personId: string) {
  const lessons = await connection.query<{ lesson_id: string }>(`
    SELECT lesson_id FROM icsv_training_progress WHERE course_id = $1 AND person_id = $2 ORDER BY completed_at, lesson_id
  `, [row.id, personId]);
  const attempts = await connection.query<AttemptRow>(`
    SELECT submission_id, ordinal, score, passed, submitted_at, answers
    FROM icsv_training_attempts WHERE course_id = $1 AND person_id = $2 ORDER BY ordinal
  `, [row.id, personId]);
  return { lessons: lessons.rows.map(({ lesson_id }) => lesson_id), attempts: attempts.rows };
}

async function trainingProgress(connection: Connection, row: CourseRow, personId: string): Promise<TrainingProgress> {
  const state = await progressState(connection, row, personId);
  const { rows } = await connection.query<CertificateRow>(`
    SELECT id, person_name, course_title, ministry_name, issued_at
    FROM icsv_training_certificates WHERE course_id = $1 AND person_id = $2
  `, [row.id, personId]);
  const certificate = rows[0];
  const approved = state.attempts.some(({ passed }) => passed);
  // The attempt limit is per person, independent of the account or number of browser sessions.
  const remaining = approved ? 0 : maxAttempts - state.attempts.length;
  let status: TrainingProgress["status"] = "nao_iniciado";
  if (certificate) status = "concluido";
  else if (approved) status = "aprovado";
  else if (!remaining) status = "nao_concluido";
  else if (state.attempts.length || state.lessons.length) status = "em_andamento";

  return {
    aulasConcluidas: state.lessons,
    tentativas: state.attempts.map((attempt) => ({
      ordem: attempt.ordinal, nota: Number(attempt.score), aprovada: attempt.passed,
      enviadoEm: attempt.submitted_at.toISOString(),
    })),
    tentativasRestantes: remaining,
    status,
    certificado: certificate ? {
      id: certificate.id, nome: certificate.person_name, curso: certificate.course_title,
      ministerio: certificate.ministry_name, emitidoEm: certificate.issued_at.toISOString(),
    } : null,
  };
}

export async function readTraining(actor: Actor, id: string): Promise<TrainingDetail> {
  const pool = database();
  const { row, canManage, learner } = await findCourse(actor, id);
  return {
    course: {
      ...courseSummary(row, canManage),
      aulas: row.lessons,
      questoes: row.questions.map(({ id, enunciado, opcoes }) => ({ id, enunciado, opcoes })),
      conteudoBloqueado: canManage && row.content_locked,
    },
    progresso: learner ? await trainingProgress(pool, row, learner) : null,
  };
}

function validateAnswers(questions: StoredQuestion[], answers: { questaoId: string; opcao: number }[]) {
  const options = new Map(answers.map(({ questaoId, opcao }) => [questaoId, opcao]));
  if (options.size !== answers.length || options.size !== questions.length ||
      questions.some(({ id, opcoes }) => !options.has(id) || options.get(id)! >= opcoes.length)) {
    throw new ApiError(400, "Selecione exatamente uma alternativa válida para cada pergunta.");
  }
  return Object.fromEntries(options);
}

async function saveAttempt(
  client: PoolClient,
  row: CourseRow,
  learner: string,
  action: Extract<z.infer<typeof actionSchema>, { acao: "enviar-questionario" }>,
) {
  const answers = validateAnswers(row.questions, action.respostas);
  const { attempts } = await progressState(client, row, learner);
  const previous = attempts.find(({ submission_id }) => submission_id === action.envioId);
  if (previous) {
    if (row.questions.some(({ id }) => answers[id] !== previous.answers[id])) {
      throw new ApiError(409, "Este envio já foi registrado com outras respostas.");
    }
    return;
  }

  if (attempts.some(({ passed }) => passed)) {
    throw new ApiError(409, "O questionário deste curso já foi aprovado.");
  }
  if (attempts.length >= maxAttempts) {
    throw new ApiError(409, "As três tentativas deste curso já foram usadas.");
  }

  const correct = row.questions.filter(({ id, gabarito }) => answers[id] === gabarito).length;
  const points = correct * 100 / row.questions.length;
  const passed = correct * 100 >= row.minimum_score * row.questions.length;
  await client.query(`
    INSERT INTO icsv_training_attempts
      (id, course_id, person_id, submission_id, ordinal, score, passed, answers)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  `, [randomUUID(), row.id, learner, action.envioId, attempts.length + 1, points.toFixed(2), passed, JSON.stringify(answers)]);
}

async function issueCertificate(client: PoolClient, row: CourseRow, learner: string) {
  const { lessons, attempts } = await progressState(client, row, learner);
  if (!attempts.some(({ passed }) => passed) ||
      row.lessons.some((lesson) => lesson.obrigatoria && !lessons.includes(lesson.id))) return;

  await client.query(`
    INSERT INTO icsv_training_certificates (id, course_id, person_id, person_name, course_title, ministry_name)
    SELECT $1, $2, id, data->>'nome', $4, $5 FROM icsv_records WHERE id = $3
    ON CONFLICT (course_id, person_id) DO NOTHING
  `, [randomUUID(), row.id, learner, row.title, row.ministry_name]);
}

export async function performTrainingAction(id: string, input: unknown) {
  const action = actionSchema.parse(input);
  return recordTransaction(async (client) => {
    const actor = await requireUser(client);
    assertGrant(actor, learnGrant);
    const { row, learner } = await findCourse(actor, id, client);
    if (!learner) throw new ApiError(403, "Vincule-se à equipe do ministério para participar deste curso.");

    if (action.acao === "concluir-aula") {
      if (!row.lessons.some((lesson) => lesson.id === action.aulaId)) {
        throw new ApiError(404, "Aula não encontrada neste curso.");
      }
      await client.query(`
        INSERT INTO icsv_training_progress (course_id, person_id, lesson_id)
        VALUES ($1, $2, $3) ON CONFLICT DO NOTHING
      `, [row.id, learner, action.aulaId]);
    } else {
      await saveAttempt(client, row, learner, action);
    }
    await issueCertificate(client, row, learner);
    return trainingProgress(client, row, learner);
  });
}
