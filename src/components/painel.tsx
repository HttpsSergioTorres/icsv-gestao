'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { ResourceName } from '@/lib/domain/resources'
import {
  ArrowDownToLine, ArrowRight, CalendarDays, Church, ClipboardList, Database,
  LayoutGrid, Network, RefreshCw, UserRound, Users, Wallet,
} from 'lucide-react'
import { api, dateTime, downloadCsv, integer, messageOf, money, type RecordItem } from './client-api'
import { AccessDenied, useSession } from './gestao-shell'

const metricLabels = {
  congregacoes: 'Congregações',
  membros: 'Membros',
  membrosAtivos: 'Membros ativos',
  ministerios: 'Ministérios',
  eventos: 'Eventos',
  eventosRealizados: 'Eventos realizados',
  inscricoes: 'Inscrições',
  escalas: 'Escalas',
  escalasConfirmadas: 'Escalas confirmadas',
  receitas: 'Receitas',
  despesas: 'Despesas',
  saldo: 'Saldo',
  projetos: 'Projetos',
  tarefasPendentes: 'Tarefas pendentes',
}

type Metric = keyof typeof metricLabels
type Summary = Partial<Record<Metric, number | null>>
type CongregationSummary = { id: string; nome: string } & Summary

interface ReportData {
  summary: Summary
  byCongregation: CongregationSummary[]
  byMinistry: { id: string; nome: string; equipe: number }[]
  upcomingEvents: { id: string; titulo: string; inicio: string; fim: string; congregacaoId: string }[]
}

const cards = [
  { key: 'congregacoes', icon: Church, href: '/congregacoes', color: 'teal' },
  { key: 'membrosAtivos', icon: Users, href: '/pessoas', color: 'mint' },
  { key: 'ministerios', icon: Network, href: '/ministerios', color: 'gold' },
  { key: 'eventos', icon: CalendarDays, href: '/agenda', color: 'purple' },
  { key: 'tarefasPendentes', icon: ClipboardList, href: '/tarefas', color: 'teal' },
  { key: 'saldo', icon: Wallet, href: '/movimentacoes', color: 'mint' },
] as const

function formatMetric(key: Metric, value: number | null | undefined) {
  if (value == null) return '—'
  return (key === 'saldo' || key === 'receitas' || key === 'despesas' ? money : integer).format(value)
}

export function PageHeading({ title, description, children }: { title: string; description?: string; children?: ReactNode }) {
  return <header className="module-heading">
    <div><h1>{title}</h1>{description && <p>{description}</p>}</div>
    {children && <div className="heading-actions">{children}</div>}
  </header>
}

export function Loading() {
  return <div className="loading-card" role="status"><span className="spinner" /> Carregando…</div>
}

export function LoadError({ error, retry }: { error: string; retry: () => void }) {
  return <div className="state-card" role="alert"><p>{error}</p><button className="btn btn-secondary" type="button" onClick={retry}><RefreshCw size={16} />Tentar novamente</button></div>
}

export function Empty({ title, description, children }: { title: string; description?: string; children?: ReactNode }) {
  return <div className="state-card"><Database size={24} aria-hidden="true" /><h2>{title}</h2>{description && <p>{description}</p>}{children}</div>
}

function useReport(url: string, enabled = true) {
  const [result, setResult] = useState<{ url: string; data?: ReportData; error?: string }>()
  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => { setResult(undefined); setAttempt((current) => current + 1) }, [])

  useEffect(() => {
    if (!enabled) return
    const aborter = new AbortController()
    api<ReportData>(url, { signal: aborter.signal })
      .then((data) => setResult({ url, data }))
      .catch((error: unknown) => {
        if (!aborter.signal.aborted) setResult({ url, error: messageOf(error) })
      })
    return () => aborter.abort()
  }, [url, attempt, enabled])
  return { data: result?.url === url ? result.data : undefined, error: result?.url === url ? result.error : undefined, retry }
}

function SummaryCards({ data }: { data: ReportData }) {
  const visible = cards.filter(({ key }) => data.summary[key] != null)
  if (!visible.length) return <Empty title="Indicadores indisponíveis" description="Seu perfil não possui acesso aos dados do painel." />
  return <div className="metric-grid">{visible.map(({ key, icon: Icon, href, color }) => (
    <Link key={key} className="metric-card" href={href}>
      <span className={`metric-icon metric-${color}`}><Icon size={19} aria-hidden="true" /></span>
      <ArrowRight className="metric-arrow" size={16} aria-hidden="true" />
      <span className="metric-value">{formatMetric(key, data.summary[key])}</span>
      <span className="metric-label">{metricLabels[key]}</span>
    </Link>
  ))}</div>
}

const shortcuts: { resource: ResourceName; label: string; detail: string; icon: typeof Users }[] = [
  { resource: 'pessoas', label: 'Cadastro de pessoas', detail: 'Membros, visitantes e voluntários', icon: UserRound },
  { resource: 'congregacoes', label: 'Congregações', detail: 'Unidades do Campo San Vale', icon: Church },
  { resource: 'escalas', label: 'Escalas de serviço', detail: 'Organização de equipes e cultos', icon: ClipboardList },
  { resource: 'movimentacoes', label: 'Movimentações', detail: 'Receitas e despesas registradas', icon: Wallet },
]

export function Painel() {
  const user = useSession()
  const { data, error, retry } = useReport('/api/dashboard', user.canViewDashboard)
  const links = shortcuts.filter(({ resource }) => user.permissions[resource]?.read)
  const today = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full', timeZone: 'America/Sao_Paulo' }).format(new Date())

  return <>
    <div className="welcome">
      <div className="welcome-decoration" aria-hidden="true"><i /><i /><i /></div>
      <div className="welcome-copy">
        <p className="welcome-date"><CalendarDays size={16} aria-hidden="true" />{today}</p>
        <h1>Painel geral</h1>
        <p>Olá, {user.name.split(' ')[0]}. Acompanhe as atividades do Campo San Vale.</p>
      </div>
      {user.permissions.eventos?.read && <Link className="btn welcome-action" href="/agenda">Abrir agenda<ArrowRight size={16} aria-hidden="true" /></Link>}
    </div>
    {user.canViewDashboard && <section className="dash-section" aria-labelledby="indicators">
      <div className="section-heading"><LayoutGrid size={19} aria-hidden="true" /><h2 id="indicators">Indicadores</h2></div>
      {data ? <SummaryCards data={data} /> : error ? <LoadError error={error} retry={retry} /> : <Loading />}
    </section>}
    <div className="dash-columns">
      {user.canViewDashboard && user.permissions.eventos?.read && <section className="dash-panel" aria-labelledby="upcoming">
        <div className="panel-heading"><div className="section-heading"><CalendarDays size={19} aria-hidden="true" /><h2 id="upcoming">Próximos eventos</h2></div><Link href="/agenda" className="text-link">Ver agenda <ArrowRight size={15} /></Link></div>
        {data
          ? data.upcomingEvents.length
            ? <ul className="dash-list">{data.upcomingEvents.map((event) => (
              <li key={`${event.id}:${event.inicio}`}><span className="list-icon"><CalendarDays size={17} /></span><div><strong>{event.titulo}</strong><small>{dateTime.format(new Date(event.inicio))}</small></div></li>
            ))}</ul>
            : <p className="panel-empty">Nenhum evento agendado.</p>
          : error ? <p className="panel-empty">A agenda está indisponível.</p> : <Loading />}
      </section>}
      {!!links.length && <section className="dash-panel" aria-labelledby="shortcuts">
        <div className="panel-heading"><div className="section-heading"><ArrowRight size={19} aria-hidden="true" /><h2 id="shortcuts">Acesso rápido</h2></div></div>
        <ul className="dash-list">{links.map(({ resource, label, detail, icon: Icon }) => (
          <li key={resource}><Link href={`/${resource}`}><span className="list-icon"><Icon size={17} aria-hidden="true" /></span><div><strong>{label}</strong><small>{detail}</small></div><ArrowRight className="dash-link-arrow" size={15} aria-hidden="true" /></Link></li>
        ))}</ul>
      </section>}
    </div>
  </>
}

const reportMetrics = Object.keys(metricLabels) as Metric[]

export function Relatorios() {
  const user = useSession()
  const [congregations, setCongregations] = useState<RecordItem[]>([])
  const [filters, setFilters] = useState({ congregacaoId: '', de: '', ate: '' })
  const search = new URLSearchParams(Object.entries(filters).filter(([, value]) => value))
  const { data, error, retry } = useReport(`/api/reports?${search.toString()}`, user.canViewReports)

  useEffect(() => {
    if (!user.permissions.congregacoes?.read) return
    const aborter = new AbortController()
    api<{ items: RecordItem[] }>('/api/congregacoes', { signal: aborter.signal })
      .then(({ items }) => setCongregations(items)).catch(() => undefined)
    return () => aborter.abort()
  }, [user.permissions])

  const metrics = data ? reportMetrics.filter((key) => data.summary[key] != null) : []
  const tableMetrics = metrics.filter((key) => key !== 'congregacoes')
  function exportReport() {
    if (!data) return
    const rows = [['Congregação', ...tableMetrics.map((key) => metricLabels[key])]]
    rows.push(['Total', ...tableMetrics.map((key) => formatMetric(key, data.summary[key]))])
    rows.push(...data.byCongregation.map((row) => [row.nome, ...tableMetrics.map((key) => formatMetric(key, row[key]))]))
    if (data.byMinistry.length) {
      rows.push([], ['Ministério', 'Equipe'], ...data.byMinistry.map((row) => [row.nome, String(row.equipe)]))
    }
    downloadCsv('icsv-relatorios.csv', rows)
  }

  if (!user.canViewReports) return <AccessDenied />

  return <>
    <PageHeading title="Relatórios" description="Resultados por congregação. O período filtra atividades e movimentações. Os cadastros refletem a situação atual.">
      {data && !!metrics.length && <button type="button" className="btn btn-secondary" onClick={exportReport}><ArrowDownToLine size={17} />Exportar CSV</button>}
    </PageHeading>
    <div className="filters report-filters">
      {!!congregations.length && <label>Congregação<select value={filters.congregacaoId} onChange={(event) => setFilters({ ...filters, congregacaoId: event.target.value })}>
        <option value="">Todas as congregações</option>
        {congregations.map((item) => <option key={item.id} value={item.id}>{String(item.nome)}</option>)}
      </select></label>}
      <label>De<input value={filters.de} type="date" max={filters.ate || undefined} onChange={(event) => setFilters({ ...filters, de: event.target.value })} /></label>
      <label>Até<input value={filters.ate} type="date" min={filters.de || undefined} onChange={(event) => setFilters({ ...filters, ate: event.target.value })} /></label>
      {(filters.de || filters.ate || filters.congregacaoId) && <button type="button" className="btn btn-secondary" onClick={() => setFilters({ congregacaoId: '', de: '', ate: '' })}>Limpar filtros</button>}
    </div>
    {data
      ? !metrics.length
        ? <Empty title="Sem dados disponíveis" description="O perfil atual não possui acesso a indicadores consolidados." />
        : <>
          <section className="dash-section">
            <div className="section-heading"><h2>Resumo</h2></div>
            <dl className="report-metrics">{metrics.map((key) => <div key={key}><dt>{metricLabels[key]}</dt><dd>{formatMetric(key, data.summary[key])}</dd></div>)}</dl>
          </section>
          {!!data.byCongregation.length && !!tableMetrics.length && <section className="dash-section">
            <div className="section-heading"><h2>Resultados por congregação</h2></div>
            <div className="table-scroll"><table><thead><tr><th scope="col">Congregação</th>{tableMetrics.map((key) => <th scope="col" key={key}>{metricLabels[key]}</th>)}</tr></thead>
              <tbody>{data.byCongregation.map((row) => <tr key={row.id}><th scope="row">{row.nome}</th>{tableMetrics.map((key) => <td key={key}>{formatMetric(key, row[key])}</td>)}</tr>)}</tbody>
            </table></div>
          </section>}
          {!!data.byMinistry.length && <section className="dash-section">
            <div className="section-heading"><h2>Distribuição por ministério</h2></div>
            <div className="table-scroll"><table><thead><tr><th scope="col">Ministério</th><th scope="col">Pessoas na equipe</th></tr></thead>
              <tbody>{data.byMinistry.map((row) => <tr key={row.id}><th scope="row">{row.nome}</th><td>{integer.format(row.equipe)}</td></tr>)}</tbody>
            </table></div>
          </section>}
        </>
      : error ? <LoadError error={error} retry={retry} /> : <Loading />}
  </>
}
