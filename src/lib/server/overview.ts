import { z } from "zod";
import { assertGrant, hasAccess, requireUser } from "./auth";
import { ApiError } from "./http";
import { listRecords } from "./records";
import { eventTime, iterateOccurrences } from "../domain/occurrences";
import type { ResourceName } from "../domain/resources";

const sources = [
  "congregacoes",
  "pessoas",
  "ministerios",
  "equipes",
  "eventos",
  "inscricoes",
  "escalas",
  "movimentacoes",
  "projetos",
  "tarefas",
] as const satisfies readonly ResourceName[];

type Source = typeof sources[number];
type Row = { id: string; [key: string]: unknown };
type Dataset = Record<Source, Row[]>;
type DateRange = { de?: string; ate?: string };

const localDateFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function dateKey(value: unknown) {
  if (typeof value !== "string") return "";
  if (value.length === 10) return value;
  const instant = new Date(eventTime(value));
  return Number.isNaN(instant.valueOf()) ? "" : localDateFormat.format(instant);
}

function inRange(value: unknown, { de, ate }: DateRange) {
  if (!de && !ate) return true;
  const day = dateKey(value);
  return day !== "" && (!de || day >= de) && (!ate || day <= ate);
}

function rangeStart(day: string | undefined) {
  return day ? new Date(`${day}T00:00:00-03:00`) : undefined;
}

function rangeEnd(day: string | undefined) {
  return day ? new Date(Date.parse(`${day}T23:59:59.999-03:00`) + 1) : undefined;
}

function asEvent({ inicio, fim, recorrencia, recorrenciaAte }: Row) {
  if (typeof inicio !== "string" || typeof fim !== "string") return null;
  return {
    inicio, fim,
    recorrencia: typeof recorrencia === "string" ? recorrencia : undefined,
    recorrenciaAte: typeof recorrenciaAte === "string" ? recorrenciaAte : undefined,
  };
}

function metrics(rows: Dataset, range: DateRange, available: ReadonlySet<Source>) {
  const members = rows.pessoas.filter(({ tipo }) => tipo === "membro");
  const hasPeriod = Boolean(range.de || range.ate);
  const from = rangeStart(range.de);
  const until = rangeEnd(range.ate);
  const activities = hasPeriod ? rows.eventos.filter((row) => {
    const event = asEvent(row);
    if (!event) return false;
    const series = row.status === "cancelado" ? { ...event, recorrencia: undefined } : event;
    return iterateOccurrences(series, from, until).next().done === false;
  }) : rows.eventos;
  const activityIds = new Set(activities.map(({ id }) => id));
  const activityMatches = (eventId: unknown) =>
    !hasPeriod || (typeof eventId === "string" && activityIds.has(eventId));
  const enrollments = rows.inscricoes.filter(({ eventoId, status }) =>
    activityMatches(eventoId) && status !== "cancelado",
  );
  const shifts = rows.escalas.filter(({ eventoId }) => activityMatches(eventoId));
  let incomeCents = 0;
  let expenseCents = 0;
  for (const { data, tipo, valor } of rows.movimentacoes) {
    if (!inRange(data, range)) continue;
    const cents = Math.round(Number(valor) * 100);
    if (tipo === "receita") incomeCents += cents;
    if (tipo === "despesa") expenseCents += cents;
  }
  const when = (source: Source, value: number) => available.has(source) ? value : null;
  const activityMetric = (source: "inscricoes" | "escalas", value: number) =>
    hasPeriod && !available.has("eventos") ? null : when(source, value);
  return {
    congregacoes: when("congregacoes", rows.congregacoes.length),
    membros: when("pessoas", members.length),
    membrosAtivos: when("pessoas", members.filter(({ ativo }) => ativo === true).length),
    ministerios: when("ministerios", rows.ministerios.length),
    eventos: when("eventos", activities.length),
    eventosRealizados: when("eventos", activities.filter(({ status }) => status === "realizado").length),
    inscricoes: activityMetric("inscricoes", enrollments.length),
    escalas: activityMetric("escalas", shifts.length),
    escalasConfirmadas: activityMetric("escalas", shifts.filter(({ status }) => status === "confirmada").length),
    receitas: when("movimentacoes", incomeCents / 100),
    despesas: when("movimentacoes", expenseCents / 100),
    saldo: when("movimentacoes", (incomeCents - expenseCents) / 100),
    projetos: when("projetos", rows.projetos.length),
    tarefasPendentes: when("tarefas", rows.tarefas.filter(({ status }) => status === "pendente" || status === "em_andamento").length),
  };
}

function upcoming(rows: Row[], range: DateRange) {
  const limit = 6;
  const today = new Date();
  const firstDay = rangeStart(range.de) ?? today;
  const from = firstDay > today ? firstDay : today;
  const until = rangeEnd(range.ate);
  const occurrences = rows.flatMap((row) => {
    const event = asEvent(row);
    if (row.status !== "agendado" || !event) return [];
    const { id, titulo, congregacaoId } = row;
    const batch = [];
    const iterator = iterateOccurrences({ id, titulo, congregacaoId, ...event }, from, until);
    for (const occurrence of iterator) {
      if (eventTime(occurrence.inicio) < from.valueOf()) continue;
      batch.push(occurrence);
      if (batch.length === limit) break;
    }
    return batch;
  });
  return occurrences
    .sort((left, right) => eventTime(left.inicio) - eventTime(right.inicio))
    .slice(0, limit)
    .map(({ id, titulo, inicio, fim, congregacaoId }) => ({ id, titulo, inicio, fim, congregacaoId }));
}

function forCongregation(rows: Dataset, congregationId: string): Dataset {
  return Object.fromEntries(sources.map((source) => [
    source,
    rows[source].filter((row) => source === "congregacoes" ? row.id === congregationId : row.congregacaoId === congregationId),
  ])) as Dataset;
}

const filters = z.object({
  congregacaoId: z.uuid("Selecione uma congregação válida.").optional(),
  de: z.iso.date("Informe uma data inicial válida.").optional(),
  ate: z.iso.date("Informe uma data final válida.").optional(),
});

export async function readOverview(request: Request, area: "dashboard" | "reports") {
  const actor = await requireUser();
  assertGrant(actor, `${area}:read`);

  const query = new URL(request.url).searchParams;
  const { congregacaoId, de, ate } = filters.parse({
    congregacaoId: query.get("congregacaoId") || undefined,
    de: query.get("de") || undefined,
    ate: query.get("ate") || undefined,
  });
  if (de && ate && ate < de) throw new ApiError(400, "A data final deve ser igual ou posterior à data inicial.");

  const availableResources = sources.filter((source) => hasAccess(actor, source, "read"));
  const allowed = new Set<Source>(availableResources);
  const entries = await Promise.all(sources.map(async (source) => [
    source,
    allowed.has(source) ? await listRecords(actor, source, congregacaoId) : [],
  ] as const));
  const rows = Object.fromEntries(entries) as Dataset;
  const range = { de, ate };
  return {
    availableResources,
    summary: metrics(rows, range, allowed),
    byCongregation: rows.congregacoes.map(({ id, nome }) => ({ id, nome, ...metrics(forCongregation(rows, id), range, allowed) })),
    byMinistry: allowed.has("equipes") ? rows.ministerios.map(({ id, nome }) => ({
      id,
      nome,
      equipe: rows.equipes.filter((row) => row.ministerioId === id && row.ativo).length,
    })) : [],
    upcomingEvents: upcoming(rows.eventos, range),
  };
}
