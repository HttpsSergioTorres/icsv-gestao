export interface RecurringEvent {
  inicio: string;
  fim: string;
  recorrencia?: string | null;
  recorrenciaAte?: string | null;
}

const day = 86_400_000;

function timezoneOffset(value: string): number {
  const offset = value.match(/([+-])(\d{2}):(\d{2})$/);
  if (!offset) return value.endsWith("Z") ? 0 : -3 * 60;
  const minutes = Number(offset[2]) * 60 + Number(offset[3]);
  return offset[1] === "-" ? -minutes : minutes;
}

export function eventTime(value: string): number {
  const hasOffset = /(?:Z|[+-]\d{2}:\d{2})$/.test(value);
  return Date.parse(hasOffset ? value : `${value}-03:00`);
}

function utcDate(year: number, month: number, date: number): Date {
  const result = new Date(0);
  result.setUTCFullYear(year, month, date);
  return result;
}

function startDate(start: Date, count: number, frequency: string): number {
  if (frequency === "mensal") {
    const year = start.getUTCFullYear();
    const month = start.getUTCMonth() + count;
    const daysInMonth = utcDate(year, month + 1, 0).getUTCDate();
    const monthDay = Math.min(start.getUTCDate(), daysInMonth);
    const timeOfDay = ((start.valueOf() % day) + day) % day;
    return utcDate(year, month, monthDay).valueOf() + timeOfDay;
  }

  const step = frequency === "quinzenal" ? 14 : 7;
  return start.valueOf() + count * step * day;
}

function firstCandidate(start: Date, frequency: string, lowerBound: number): number {
  if (!Number.isFinite(lowerBound) || lowerBound <= start.valueOf()) return 0;
  if (frequency === "mensal") {
    const date = new Date(lowerBound);
    const months = (date.getUTCFullYear() - start.getUTCFullYear()) * 12
      + date.getUTCMonth() - start.getUTCMonth();
    return Math.max(0, months - 1);
  }
  const step = frequency === "quinzenal" ? 14 : 7;
  return Math.max(0, Math.floor((lowerBound - start.valueOf()) / (step * day)));
}

/**
 * Expands a recurring activity using its original offset and duration. Dates without
 * an explicit offset are interpreted in Brasília time (UTC−03:00).
 * The optional window returns occurrences that overlap [from, until).
 */
export function* iterateOccurrences<T extends RecurringEvent>(
  event: T,
  from?: Date,
  until?: Date,
): Generator<T> {
  const initial = eventTime(event.inicio);
  const duration = eventTime(event.fim) - initial;
  if (!Number.isFinite(initial) || !Number.isFinite(duration) || duration <= 0) return;

  const lower = from?.valueOf() ?? -Infinity;
  const upper = until?.valueOf() ?? Infinity;
  if (lower >= upper) return;

  const offset = timezoneOffset(event.inicio) * 60_000;
  const start = new Date(initial + offset);
  const frequency = event.recorrencia;
  const recurring = frequency === "semanal" || frequency === "quinzenal" || frequency === "mensal";
  const lastDay = event.recorrenciaAte ? Date.parse(`${event.recorrenciaAte}T23:59:59.999Z`) : NaN;
  if (!recurring || !Number.isFinite(lastDay)) {
    if (initial < upper && initial + duration > lower) {
      yield { ...event, inicio: new Date(initial).toISOString(), fim: new Date(initial + duration).toISOString() };
    }
    return;
  }

  const first = firstCandidate(start, frequency, lower + offset - duration);
  for (let index = first; ; index++) {
    const local = startDate(start, index, frequency);
    const time = local - offset;
    if (local > lastDay || time >= upper) return;
    if (time + duration > lower) {
      yield { ...event, inicio: new Date(time).toISOString(), fim: new Date(time + duration).toISOString() };
    }
  }
}

export function expandOccurrences<T extends RecurringEvent>(event: T, from?: Date, until?: Date): T[] {
  return [...iterateOccurrences(event, from, until)];
}
