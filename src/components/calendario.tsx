"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, List, MapPin } from "lucide-react";
import { expandOccurrences } from "@/lib/domain/occurrences";
import { api, dateTime, messageOf, type RecordItem } from "./client-api";
import { AccessDenied, useSession } from "./gestao-shell";
import { LinkChamada } from "./link-chamada";
import { Empty, LoadError, Loading, PageHeading } from "./painel";

type Mode = "mes" | "semana";
type Activity = {
  id: string;
  titulo: string;
  inicio: string;
  fim: string;
  tipo: string;
  status: string;
  congregacaoId: string;
  ministerioId?: string;
  recorrencia?: string | null;
  recorrenciaAte?: string | null;
  local?: string;
};
type Schedule = {
  activities: Activity[];
  congregations: RecordItem[];
  ministries: RecordItem[];
};

const timezone = "America/Sao_Paulo";
const dayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, dateStyle: "short" });
const monthFormat = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", month: "long", year: "numeric" });
const fullDayFormat = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", dateStyle: "full" });
const shortTime = new Intl.DateTimeFormat("pt-BR", { timeZone: timezone, hour: "2-digit", minute: "2-digit" });
const daysOfWeek = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const statusLabels: Record<string, string> = { agendado: "Agendado", realizado: "Realizado", cancelado: "Cancelado" };
const activityLabels: Record<string, string> = { culto: "Culto", reuniao: "Reunião", evento: "Evento" };

function localDay(date: Date) {
  const parts = dayFormat.formatToParts(date);
  return ["year", "month", "day"].map((part) => parts.find(({ type }) => type === part)?.value).join("-");
}

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function dayStart(key: string) {
  return new Date(`${key}T00:00:00-03:00`);
}

function shifted(date: Date, days: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
}

function rangeFor(date: Date, mode: Mode) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const base = mode === "mes" ? new Date(Date.UTC(year, month, 1)) : date;
  const first = shifted(base, -base.getUTCDay());
  const lastDay = new Date(Date.UTC(year, month + 1, 0));
  const count = mode === "mes" ? Math.ceil((base.getUTCDay() + lastDay.getUTCDate()) / 7) * 7 : 7;
  return { days: Array.from({ length: count }, (_, index) => shifted(first, index)), first, end: shifted(first, count) };
}

function useCalendarData(activities: boolean, congregations: boolean, ministries: boolean) {
  const [data, setData] = useState<Schedule>();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!activities) return;
    const abort = new AbortController();
    const options = { signal: abort.signal };
    const loadList = (path: string, enabled: boolean) =>
      enabled ? api<{ items: RecordItem[] }>(path, options).then(({ items }) => items) : Promise.resolve([]);

    Promise.all([
      api<{ items: Activity[] }>("/api/eventos", options),
      loadList("/api/congregacoes", congregations),
      loadList("/api/ministerios", ministries),
    ]).then(([{ items }, congregationItems, ministryItems]) => {
      setData({ activities: items, congregations: congregationItems, ministries: ministryItems });
    }).catch((failure: unknown) => {
      if (!abort.signal.aborted) setError(messageOf(failure));
    });
    return () => abort.abort();
  }, [activities, congregations, ministries, attempt]);
  const retry = () => {
    setError("");
    setData(undefined);
    setAttempt((value) => value + 1);
  };
  return { data, error, retry };
}

export function Calendario() {
  const user = useSession();
  const today = localDay(new Date());
  const [cursor, setCursor] = useState(() => new Date(`${today}T00:00:00Z`));
  const [mode, setMode] = useState<Mode>("mes");
  const [selected, setSelected] = useState(today);
  const [congregation, setCongregation] = useState("");
  const [ministry, setMinistry] = useState("");
  const allowed = Boolean(user.permissions.eventos?.read);
  const { data, error, retry } = useCalendarData(allowed,
    Boolean(user.permissions.congregacoes?.read), Boolean(user.permissions.ministerios?.read));
  const window = useMemo(() => rangeFor(cursor, mode), [cursor, mode]);
  const byDay = useMemo(() => {
    const groups = new Map<string, Activity[]>();
    if (!data) return groups;
    const from = dayStart(dayKey(window.first));
    const until = dayStart(dayKey(window.end));
    const activities = data.activities.filter((event) => (
      (!congregation || event.congregacaoId === congregation) && (!ministry || event.ministerioId === ministry)
    ));
    for (const activity of activities) {
      const series = activity.status === "cancelado" ? { ...activity, recorrencia: null } : activity;
      for (const occurrence of expandOccurrences(series, from, until)) {
        for (const day of window.days) {
          const key = dayKey(day);
          if (dayStart(key).valueOf() >= Date.parse(occurrence.fim)
            || dayStart(dayKey(shifted(day, 1))).valueOf() <= Date.parse(occurrence.inicio)) continue;
          groups.set(key, [...(groups.get(key) ?? []), occurrence]);
        }
      }
    }
    for (const items of groups.values()) items.sort((a, b) => a.inicio.localeCompare(b.inicio));
    return groups;
  }, [data, window, congregation, ministry]);
  if (!allowed) return <AccessDenied />;

  const visibleMinistries = data?.ministries.filter((item) => !congregation || item.congregacaoId === congregation);
  const activeDay = window.days.some((date) => dayKey(date) === selected) ? selected : dayKey(cursor);
  const selectedItems = byDay.get(activeDay) ?? [];
  const label = mode === "mes"
    ? monthFormat.format(cursor)
    : `${dayKey(window.first).split("-").reverse().join("/")} – ${dayKey(shifted(window.end, -1)).split("-").reverse().join("/")}`;

  function move(direction: number) {
    if (mode === "semana") {
      const next = shifted(cursor, direction * 7);
      setCursor(next);
      setSelected(dayKey(next));
      return;
    }
    const next = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + direction, 1));
    setCursor(next);
    setSelected(dayKey(next));
  }

  return (
    <>
      <PageHeading title="Agenda" description="Cultos, reuniões e eventos do Campo San Vale.">
        <Link href="/eventos" className="btn btn-secondary"><List size={17} aria-hidden="true" /> Gerenciar atividades</Link>
      </PageHeading>
      {error && <LoadError error={error} retry={retry} />}
      {!data && !error && <Loading />}
      {data && <>
        <div className="filters agenda-filters">
          {data.congregations.length > 0 && <label>Congregação
            <select value={congregation} onChange={(event) => { setCongregation(event.target.value); setMinistry(""); }}>
              <option value="">Todas as congregações</option>
              {data.congregations.map((item) => <option key={item.id} value={item.id}>{String(item.nome)}</option>)}
            </select>
          </label>}
          {Boolean(visibleMinistries?.length) && <label>Ministério
            <select value={ministry} onChange={(event) => setMinistry(event.target.value)}>
              <option value="">Todos os ministérios</option>
              {visibleMinistries?.map((item) => <option key={item.id} value={item.id}>{String(item.nome)}</option>)}
            </select>
          </label>}
        </div>
        <section className="agenda-calendar" aria-label="Calendário de atividades">
          <div className="agenda-toolbar">
            <div className="agenda-navigation">
              <button className="btn btn-secondary" type="button" aria-label="Período anterior" onClick={() => move(-1)}><ChevronLeft size={17} /></button>
              <button className="btn btn-secondary" type="button" aria-label="Próximo período" onClick={() => move(1)}><ChevronRight size={17} /></button>
              <button className="btn btn-secondary" type="button" onClick={() => { setCursor(new Date(`${today}T00:00:00Z`)); setSelected(today); }}>Hoje</button>
            </div>
            <h2>{label}</h2>
            <div className="agenda-view" aria-label="Visualização">
              <button type="button" aria-pressed={mode === "mes"} onClick={() => setMode("mes")}>Mês</button>
              <button type="button" aria-pressed={mode === "semana"} onClick={() => {
                setCursor(new Date(`${activeDay}T00:00:00Z`));
                setMode("semana");
              }}>Semana</button>
            </div>
          </div>
          <div className="agenda-grid">
            {daysOfWeek.map((day) => <span key={day} className="agenda-weekday" aria-hidden="true">{day}</span>)}
            {window.days.map((date) => {
              const key = dayKey(date);
              const items = byDay.get(key) ?? [];
              return <button key={key} type="button"
                className={`agenda-day${date.getUTCMonth() !== cursor.getUTCMonth() && mode === "mes" ? " agenda-other-month" : ""}`}
                aria-pressed={key === activeDay} aria-current={key === today ? "date" : undefined}
                aria-label={`${fullDayFormat.format(date)}, ${items.length} ${items.length === 1 ? "atividade" : "atividades"}`}
                onClick={() => setSelected(key)}>
                <span className="agenda-number">{date.getUTCDate()}</span>
                {items.slice(0, 2).map((item) => <span className={`agenda-chip agenda-chip-${item.status}`} key={`${item.id}:${item.inicio}`}>{item.titulo}</span>)}
                {items.length > 2 && <span className="agenda-more">+{items.length - 2}</span>}
              </button>;
            })}
          </div>
        </section>
        <section className="agenda-detail" aria-label="Atividades do dia selecionado">
          <h2><CalendarDays size={20} aria-hidden="true" />{fullDayFormat.format(new Date(`${activeDay}T00:00:00Z`))}</h2>
          {selectedItems.length ? <ul className="agenda-events">
            {selectedItems.map((item) => (
              <li key={`${item.id}:${item.inicio}`}>
                <div className="agenda-event-time">
                  <strong>{shortTime.format(new Date(item.inicio))}</strong>
                  <small>{dateTime.format(new Date(item.fim))}</small>
                </div>
                <div className="agenda-event-name">
                  <strong><Link className="agenda-event-link" href={`/eventos?editar=${item.id}`}>{item.titulo}</Link></strong>
                  <span>{activityLabels[item.tipo] ?? item.tipo}{item.local && <> · <MapPin size={14} aria-hidden="true" /> {item.local}</>}</span>
                </div>
                <div className="agenda-event-actions">
                  <span className={`agenda-chip agenda-chip-${item.status}`}>{statusLabels[item.status] ?? item.status}</span>
                  <LinkChamada id={item.id} cancelado={item.status === "cancelado"} className="small-action" />
                </div>
              </li>
            ))}
          </ul> : <Empty title="Nenhuma atividade neste dia" />}
        </section>
      </>}
    </>
  );
}
