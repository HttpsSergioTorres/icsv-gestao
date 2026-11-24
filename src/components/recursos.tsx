'use client'

import Link from 'next/link'
import { useEffect, useId, useMemo, useState, type FormEvent } from 'react'
import { ArrowDownToLine, CalendarDays, CircleHelp, History, KeyRound, Pencil, Plus, Search } from 'lucide-react'
import { resources, type Field, type ResourceName } from '@/lib/domain/resources'
import { api, downloadCsv, formatDate, formatDateTime, messageOf, money, write, type RecordItem } from './client-api'
import { AccessDenied, useSession } from './gestao-shell'
import { LinkChamada } from './link-chamada'
import { Modal } from './modal'
import { Empty, LoadError, Loading, PageHeading } from './painel'

type Options = Partial<Record<ResourceName, RecordItem[]>>
type Value = string | boolean | string[]
type FormValues = Record<string, Value>
type Editor = { mode: 'create' | 'edit' | 'view'; item?: RecordItem }
type Action = { type: 'delete' | 'history' | 'recovery' | 'replace'; item: RecordItem }

function text(value: unknown) {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
}

const dateInputFormatter = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})

function editValue(field: Field, value: unknown): Value {
  if (field.writeOnly) return ''
  if (field.type === 'checkbox') return value === true
  if (field.type === 'multiselect') return Array.isArray(value) ? value.map(String) : []
  if (field.type === 'date') return text(value).slice(0, 10)
  if (field.type === 'datetime' && text(value)) {
    const date = new Date(text(value))
    return Number.isNaN(date.valueOf()) ? '' : dateInputFormatter.format(date).replace(' ', 'T')
  }
  return text(value)
}

function cellValue(field: Field, value: unknown, options: Options): string {
  if (field.type === 'checkbox') {
    if (field.key === 'ativo') return value ? 'Ativo' : 'Inativo'
    return value ? 'Sim' : 'Não'
  }
  if (value == null || value === '') return '—'
  if (field.type === 'date') return formatDate(value)
  if (field.type === 'datetime') return formatDateTime(value)
  if (field.type === 'money') return money.format(Number(value))
  if (field.type === 'select') return field.options?.find((option) => option.value === value)?.label ?? text(value)
  if (field.type === 'multiselect') {
    const selected = Array.isArray(value) ? value : []
    return field.options?.filter((option) => selected.includes(option.value)).map((option) => option.label).join(', ') || '—'
  }
  if (field.reference) {
    const row = options[field.reference]?.find((option) => option.id === value)
    return row ? itemLabel(field.reference, row, options) : 'Registro vinculado'
  }
  return text(value) || '—'
}

function itemLabel(resource: ResourceName, item: RecordItem, options: Options): string {
  const definition = resources[resource]
  const field = definition.fields.find(({ key }) => key === definition.labelField)
  return field ? cellValue(field, item[field.key], options) : definition.singular
}

function useRecords(resource: ResourceName, allowed: boolean) {
  const user = useSession()
  const definition = resources[resource]
  const [items, setItems] = useState<RecordItem[]>()
  const [options, setOptions] = useState<Options>({})
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  function reload() {
    setItems(undefined)
    setError('')
    setAttempt((previous) => previous + 1)
  }

  useEffect(() => {
    if (!allowed) return
    const aborter = new AbortController()
    const init = { signal: aborter.signal }
    const related = new Set(
      definition.fields.flatMap(({ reference }) => reference ? [reference] : []),
    )
    if (resource === 'projetos') related.add('tarefas')
    const readable = [...related].filter((reference) => reference !== resource && user.permissions[reference]?.read)
    Promise.all([
      api<{ items: RecordItem[] }>(`/api/${resource}`, init),
      Promise.allSettled(readable.map(async (reference) => {
        const result = await api<{ items: RecordItem[] }>(`/api/${reference}`, init)
        return [reference, result.items] as const
      })),
    ]).then(([records, references]) => {
      if (aborter.signal.aborted) return
      setOptions(Object.fromEntries(references.flatMap((result) => result.status === 'fulfilled' ? [result.value] : [])))
      setItems(records.items)
    }).catch((failure: unknown) => {
      if (!aborter.signal.aborted) setError(messageOf(failure))
    })
    return () => aborter.abort()
  }, [allowed, attempt, definition, resource, user.permissions])

  return { items, options, error, reload }
}

function optionsFor(field: Field, options: Options, values: FormValues) {
  if (!field.reference) return []
  let candidates = options[field.reference] ?? []
  const congregation = values.congregacaoId
  if (field.key !== 'congregacaoId' && congregation) {
    candidates = candidates.filter((item) => !item.congregacaoId || item.congregacaoId === congregation || item.id === values[field.key])
  }
  if (field.key === 'categoriaId' && values.tipo) {
    candidates = candidates.filter((item) => item.tipo === values.tipo || item.id === values[field.key])
  }
  return candidates.filter((item) => item.ativo !== false || item.id === values[field.key])
}

function FieldInput({ field, value, options, values, create, change }: {
  field: Field; value: Value; options: Options; values: FormValues; create: boolean; change: (value: Value) => void
}) {
  const id = useId()
  const required = Boolean(field.required || (create && field.requiredOnCreate) || (field.key === 'recorrenciaAte' && values.recorrencia !== 'nenhuma'))
  if (field.type === 'multiselect') {
    const selected = Array.isArray(value) ? value : []
    return <fieldset className="permission-picker full-field"><legend>{field.label}</legend><div>{field.options?.map((option) => (
      <label key={option.value}><input type="checkbox" checked={selected.includes(option.value)} onChange={(event) => change(event.target.checked ? [...selected, option.value] : selected.filter((choice) => choice !== option.value))} />{option.label}</label>
    ))}</div></fieldset>
  }
  if (field.type === 'checkbox') {
    return <label className="checkbox-field"><input type="checkbox" checked={value === true} onChange={(event) => change(event.target.checked)} />{field.label}</label>
  }
  if (field.type === 'reference') {
    const candidates = optionsFor(field, options, values)
    const fieldReference = field.reference!
    const missing = text(value) && !candidates.some((item) => item.id === value)
    return <label htmlFor={id}>{field.label}
      <select id={id} value={text(value)} required={required} onChange={(event) => change(event.target.value)}>
        <option value="">{required ? 'Selecione' : 'Sem vínculo'}</option>
        {missing && <option value={text(value)}>Registro vinculado</option>}
        {candidates.map((item) => <option key={item.id} value={item.id}>{itemLabel(fieldReference, item, options)}</option>)}
      </select>
    </label>
  }
  if (field.type === 'select') {
    return <label htmlFor={id}>{field.label}<select id={id} value={text(value)} required={required} onChange={(event) => change(event.target.value)}>
      <option value="">Selecione</option>
      {field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select></label>
  }
  if (field.type === 'textarea') {
    return <label className="full-field" htmlFor={id}>{field.label}<textarea id={id} required={required} rows={3} maxLength={field.maxLength ?? 4000} value={text(value)} onChange={(event) => change(event.target.value)} /></label>
  }
  const type = field.type === 'datetime' ? 'datetime-local' : field.type === 'money' ? 'number' : field.type
  return <label htmlFor={id}>{field.label}
    <input id={id} type={type} value={text(value)} required={required}
      min={field.type === 'money' ? '0.01' : undefined} step={field.type === 'money' ? '0.01' : undefined}
      minLength={field.type === 'password' ? 8 : undefined} autoComplete={field.type === 'password' ? 'new-password' : undefined}
      maxLength={field.maxLength ?? (field.type === 'password' ? 128 : undefined)} onChange={(event) => change(event.target.value)} />
    {field.type === 'password' && !create && <small>Preencha para substituir a senha atual.</small>}
    {field.type === 'datetime' && <small>Horário de Brasília</small>}
  </label>
}

function initialValues(resource: ResourceName, item: RecordItem | undefined, filters: Record<string, string>, congregation: string | null) {
  return Object.fromEntries(resources[resource].fields.map((field) => {
    const fromScope = field.key === 'congregacaoId' ? congregation : undefined
    const value = item ? item[field.key] : filters[field.key] || fromScope || field.defaultValue
    return [field.key, editValue(field, value)]
  }))
}

function editorPayload(resource: ResourceName, fields: readonly Field[], values: FormValues, create: boolean) {
  return Object.fromEntries(fields.flatMap<[string, Value | number | null | undefined]>((field) => {
    const value = values[field.key]
    if (field.writeOnly && !value) return []
    if (field.key === 'recorrenciaAte' && resource === 'eventos' && values.recorrencia === 'nenhuma') {
      return create ? [] : [[field.key, null]]
    }
    if (field.type === 'money' && typeof value === 'string' && value) return [[field.key, Number(value)]]
    if (field.type === 'datetime' && typeof value === 'string' && value) return [[field.key, `${value}:00-03:00`]]
    if (value === '') return create ? [] : [[field.key, field.required ? undefined : null]]
    return [[field.key, value]]
  }))
}

function ReceiptLink({ value }: { value: unknown }) {
  const url = typeof value === 'string' && /^\/api\/comprovantes\/[0-9a-f-]+$/i.test(value) ? value : null
  return url ? <a className="text-link" href={url}>Baixar comprovante</a> : <>{text(value) || '—'}</>
}

function Details({ resource, item, options }: { resource: ResourceName; item: RecordItem; options: Options }) {
  return <dl className="details-grid">{resources[resource].fields.filter((field) => !field.writeOnly).map((field) => (
    <div key={field.key}><dt>{field.label}</dt><dd>{field.key === 'comprovante' ? <ReceiptLink value={item[field.key]} /> : cellValue(field, item[field.key], options)}</dd></div>
  ))}</dl>
}

function RegistroEditor({ resource, editor, options, filters, close, finish }: {
  resource: ResourceName; editor: Editor; options: Options; filters: Record<string, string>; close: () => void; finish: (message: string) => void
}) {
  const user = useSession()
  const definition = resources[resource]
  const item = editor.item
  const create = editor.mode === 'create'
  const ownAccount = resource === 'usuarios' && item?.id === user.id
  const editableFields = ownAccount ? definition.fields.filter((field) => field.key !== 'senha') : definition.fields
  const [values, setValues] = useState<FormValues>(() => initialValues(resource, item, filters, user.congregacaoId))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [receipt, setReceipt] = useState<File>()
  const [receiptUrl, setReceiptUrl] = useState<string>()
  const [receiptScope, setReceiptScope] = useState('')

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const payload = editorPayload(resource, editableFields, values, create)
      if (receipt) {
        if (!values.congregacaoId) throw new Error('Selecione a congregação do comprovante.')
        if (receiptUrl && receiptScope === values.congregacaoId) {
          payload.comprovante = receiptUrl
        } else {
          const form = new FormData()
          form.append('file', receipt)
          form.append('congregacaoId', text(values.congregacaoId))
          const { url } = await api<{ url: string }>('/api/comprovantes', { method: 'POST', body: form })
          setReceiptUrl(url)
          setReceiptScope(text(values.congregacaoId))
          payload.comprovante = url
        }
      }
      await api(item ? `/api/${resource}/${item.id}` : `/api/${resource}`, write(item ? 'PATCH' : 'POST', payload))
      finish(item ? 'Alterações salvas.' : 'Registro criado.')
    } catch (failure) {
      setError(messageOf(failure, 'Não foi possível salvar o registro.'))
    } finally {
      setBusy(false)
    }
  }

  function change(key: string, value: Value) {
    setValues((previous) => {
      const next = { ...previous, [key]: value }
      if (key === 'congregacaoId' && previous.congregacaoId !== value) {
        for (const field of definition.fields) {
          if (field.reference && field.key !== key && field.reference !== 'perfis') next[field.key] = ''
        }
      }
      if (key === 'tipo' && resource === 'movimentacoes') next.categoriaId = ''
      return next
    })
  }

  return <Modal title={editor.mode === 'view' ? definition.singular : `${create ? 'Cadastrar' : 'Editar'} ${definition.singular.toLowerCase()}`} close={() => { if (!busy) close() }}>
    {editor.mode === 'view' && item ? <Details item={item} resource={resource} options={options} /> : <form onSubmit={save}>
      <div className="editor-grid">
        {editableFields.filter((field) => field.key !== 'recorrenciaAte' || values.recorrencia !== 'nenhuma').map((field) => (
          <FieldInput key={field.key} field={field} value={values[field.key]} options={options} values={values} create={create} change={(value) => change(field.key, value)} />
        ))}
        {ownAccount && <Link href="/minha-conta" className="text-link full-field"><KeyRound size={15} aria-hidden="true" />Alterar senha em Minha conta</Link>}
        {resource === 'movimentacoes' && <label className="full-field">Anexar comprovante
          <input type="file" accept="application/pdf,image/png,image/jpeg" onChange={(event) => { setReceipt(event.target.files?.[0]); setReceiptUrl(undefined) }} />
          <small>PDF, JPEG ou PNG de até 5 MB.</small>
          <ReceiptLink value={values.comprovante} />
        </label>}
      </div>
      {error && <p className="alert" role="alert">{error}</p>}
      <footer className="modal-actions"><button className="btn btn-secondary" type="button" onClick={close} disabled={busy}>Voltar</button><button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</button></footer>
    </form>}
  </Modal>
}

interface AuditEntry {
  actor: string | null
  action: string
  at: string
  fields: string[]
}

const historyLabels: Record<string, string> = { create: 'Cadastro', update: 'Edição', delete: 'Exclusão ou desativação' }

function Historico({ resource, item, close }: { resource: ResourceName; item: RecordItem; close: () => void }) {
  const [log, setLog] = useState<AuditEntry[]>()
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const fields = resources[resource].fields

  useEffect(() => {
    const aborter = new AbortController()
    api<{ items: AuditEntry[] }>(`/api/${resource}/${item.id}/historico`, { signal: aborter.signal })
      .then(({ items }) => setLog(items))
      .catch((failure: unknown) => {
        if (!aborter.signal.aborted) setError(messageOf(failure))
      })
    return () => aborter.abort()
  }, [attempt, item.id, resource])

  function retry() {
    setError('')
    setAttempt((previous) => previous + 1)
  }

  return <Modal title="Histórico de alterações" close={close}>
    {log
      ? log.length
        ? <ol className="history-list">{log.map(({ actor, action, at, fields: changed }, index) => (
          <li key={`${at}:${index}`}>
            <strong>{historyLabels[action] ?? action}</strong>
            <p>{formatDateTime(at)}{actor && ` · ${actor}`}</p>
            {!!changed?.length && <small>{changed.map((key) => fields.find((field) => field.key === key)?.label ?? key).join(', ')}</small>}
          </li>
        ))}</ol>
        : <p className="panel-empty">Nenhuma alteração registrada.</p>
      : error ? <LoadError error={error} retry={retry} /> : <Loading />}
  </Modal>
}

function RegistroAcao({ resource, action, options, close, finish }: {
  resource: ResourceName; action: Action; options: Options; close: () => void; finish: (message: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [replacement, setReplacement] = useState('')
  const [code, setCode] = useState<{ token: string; expiresAt: string }>()
  const definition = resources[resource]
  const { item, type } = action
  const title = itemLabel(resource, item, options)
  const deleteLabel = definition.fields.some((field) => field.key === 'ativo') ? 'Desativar' : resource === 'eventos' ? 'Cancelar atividade' : 'Excluir'
  const candidates = options.pessoas?.filter((person) => person.id !== item.pessoaId && person.ativo !== false && person.congregacaoId === item.congregacaoId) ?? []

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (type === 'recovery') {
        const result = await api<{ token: string; expiresAt: string }>('/api/auth/recovery', write('POST', { email: item.email }))
        setCode(result)
      } else if (type === 'replace') {
        await api(`/api/escalas/${item.id}/substituir`, write('POST', { pessoaId: replacement }))
        finish('Substituição registrada.')
      } else {
        await api(`/api/${resource}/${item.id}`, { method: 'DELETE' })
        finish(deleteLabel === 'Desativar' ? 'Registro desativado.' : deleteLabel === 'Cancelar atividade' ? 'Atividade cancelada.' : 'Registro excluído.')
      }
    } catch (failure) {
      setError(messageOf(failure, 'Não foi possível completar a ação.'))
    } finally {
      setBusy(false)
    }
  }

  return <Modal title={type === 'recovery' ? 'Recuperação de acesso' : type === 'replace' ? 'Substituir voluntário' : deleteLabel} close={() => { if (!busy) close() }}>
    {code
      ? <div className="recovery-code"><p>Entregue este código diretamente a <strong>{title}</strong>. Ele expira em {formatDateTime(code.expiresAt)}.</p><input type="text" aria-label="Código gerado" value={code.token} readOnly onFocus={(event) => event.target.select()} /><Link href="/recuperar-acesso" className="text-link" target="_blank">Abrir página de recuperação</Link></div>
      : <form onSubmit={submit}>
        {type === 'delete'
          ? <p className="modal-note">Confirma a ação para <strong>{title}</strong>?</p>
          : type === 'replace'
            ? <label className="modal-note">Novo voluntário<select value={replacement} onChange={(event) => setReplacement(event.target.value)} required>
              <option value="">Selecione</option>
              {candidates.map((person) => <option key={person.id} value={person.id}>{itemLabel('pessoas', person, options)}</option>)}
            </select></label>
            : <p className="modal-note">Gere um código de uso único para <strong>{text(item.email)}</strong>.</p>}
        {error && <p className="alert" role="alert">{error}</p>}
        <footer className="modal-actions">
          <button className="btn btn-secondary" type="button" onClick={close} disabled={busy}>Voltar</button>
          <button className={`btn ${type === 'delete' ? 'btn-danger' : 'btn-primary'}`} type="submit" disabled={busy || (type === 'replace' && !candidates.length)}>
            {busy ? 'Aguarde…' : type === 'delete' ? deleteLabel : type === 'replace' ? 'Confirmar substituição' : 'Gerar código'}
          </button>
        </footer>
      </form>}
  </Modal>
}

function normalized(value: string) {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

function queryLink(resource: ResourceName, key: string, id: string) {
  return `/${resource}?${new URLSearchParams({ [key]: id })}`
}

const relationLinks: Partial<Record<ResourceName, { resource: ResourceName; key: string; label: string }[]>> = {
  congregacoes: [
    { resource: 'pessoas', key: 'congregacaoId', label: 'Pessoas' },
    { resource: 'ministerios', key: 'congregacaoId', label: 'Ministérios' },
  ],
  ministerios: [
    { resource: 'equipes', key: 'ministerioId', label: 'Equipes' },
    { resource: 'escalas', key: 'ministerioId', label: 'Escalas' },
  ],
  pessoas: [{ resource: 'escalas', key: 'pessoaId', label: 'Escalas da pessoa' }],
  eventos: [
    { resource: 'inscricoes', key: 'eventoId', label: 'Inscrições' },
    { resource: 'escalas', key: 'eventoId', label: 'Escalas' },
    { resource: 'projetos', key: 'eventoId', label: 'Projetos' },
  ],
  projetos: [{ resource: 'tarefas', key: 'projetoId', label: 'Tarefas' }],
}

function ResourceCell({ field, item, options }: { field: Field; item: RecordItem; options: Options }) {
  const value = cellValue(field, item[field.key], options)
  if (field.key === 'ativo' || field.key === 'status' || (field.key === 'tipo' && ['receita', 'despesa'].includes(text(item[field.key])))) {
    const status = field.key === 'ativo' ? item.ativo ? 'ativo' : 'inativo' : text(item[field.key])
    return <span className="record-status" data-status={status}>{value}</span>
  }
  return <>{value}</>
}

export function Recursos({ resource, initialFilters, initialEdit, startNew }: {
  resource: ResourceName; initialFilters: Record<string, string>; initialEdit?: string; startNew: boolean
}) {
  const definition = resources[resource]
  const user = useSession()
  const permissions = user.permissions[resource]
  const { items, options, error, reload } = useRecords(resource, Boolean(permissions?.read))
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState(initialFilters)
  const [period, setPeriod] = useState({ from: '', until: '' })
  const [editor, setEditor] = useState<Editor | null>(startNew && permissions?.write ? { mode: 'create' } : null)
  const [linkedEdit, setLinkedEdit] = useState(initialEdit)
  const [action, setAction] = useState<Action | null>(null)
  const [notice, setNotice] = useState('')
  const columns = definition.fields.filter((field) => definition.columns.includes(field.key))
    .sort((left, right) => definition.columns.indexOf(left.key) - definition.columns.indexOf(right.key))
  const filtersForResource = definition.fields.filter((field) => field.type === 'select' || field.type === 'reference' || field.key === 'ativo')
  const dateField = resource === 'movimentacoes' ? 'data' : resource === 'eventos' ? 'inicio' : undefined
  const visible = useMemo(() => {
    const words = normalized(query.trim()).split(/\s+/).filter(Boolean)
    return (items ?? []).filter((item) => {
      if (Object.entries(filters).some(([key, value]) => value && text(item[key]) !== value && String(item[key]) !== value)) return false
      const day = dateField ? text(item[dateField]).slice(0, 10) : ''
      if (dateField && ((period.from && day < period.from) || (period.until && day > period.until))) return false
      const record = normalized(definition.fields.filter((field) => !field.writeOnly).map((field) => cellValue(field, item[field.key], options)).join(' '))
      return words.every((part) => record.includes(part))
    })
  }, [dateField, definition, filters, items, options, period, query])

  if (!permissions?.read) return <AccessDenied />

  const linkedItem = linkedEdit ? items?.find((item) => item.id === linkedEdit) : undefined
  const activeEditor = editor ?? (linkedItem ? { mode: permissions.write ? 'edit' as const : 'view' as const, item: linkedItem } : null)
  const nested = (relationLinks[resource] ?? []).filter((link) => user.permissions[link.resource]?.read)
  const hasFilters = query || Object.values(filters).some(Boolean) || period.from || period.until
  const totals = resource === 'movimentacoes'
    ? visible.reduce((acc, item) => ({ ...acc, [String(item.tipo)]: (acc[String(item.tipo)] ?? 0) + Math.round(Number(item.valor) * 100) }), {} as Record<string, number>)
    : null

  function finish(message: string) {
    setEditor(null)
    setLinkedEdit(undefined)
    setAction(null)
    setNotice(message)
    reload()
  }

  function clearFilters() {
    setFilters({})
    setQuery('')
    setPeriod({ from: '', until: '' })
  }

  function exportRecords() {
    downloadCsv(`icsv-${resource}.csv`, [
      columns.map(({ label }) => label),
      ...visible.map((item) => columns.map((field) => cellValue(field, item[field.key], options))),
    ])
  }

  function create() {
    setNotice('')
    setEditor({ mode: 'create' })
  }

  return <>
    <PageHeading title={resource === 'eventos' ? 'Atividades' : definition.title} description={definition.description}>
      {resource === 'eventos' && <Link className="btn btn-secondary" href="/agenda"><CalendarDays size={17} />Ver calendário</Link>}
      {definition.exportable && !!visible.length && <button className="btn btn-secondary" type="button" onClick={exportRecords}><ArrowDownToLine size={17} />Exportar CSV</button>}
      {permissions.write && <button type="button" className="btn btn-primary" onClick={create}><Plus size={18} />Novo registro</button>}
    </PageHeading>
    {notice && <p role="status" className="success-banner">{notice}</p>}
    {linkedEdit && items && !linkedItem && <p role="alert" className="alert">O registro solicitado está indisponível.</p>}
    {items
      ? <>
        <div className="filters">
          <label className="search-filter">Buscar registros<div><Search size={17} aria-hidden="true" /><input type="search" value={query} placeholder="Digite para buscar…" onChange={(event) => setQuery(event.target.value)} /></div></label>
          {filtersForResource.map((field) => {
            const values = field.reference ? options[field.reference]?.map((row) => ({ value: row.id, label: itemLabel(field.reference!, row, options) })) : field.key === 'ativo' ? [{ value: 'true', label: 'Ativos' }, { value: 'false', label: 'Inativos' }] : field.options
            if (!values?.length) return null
            return <label key={field.key}>{field.label}<select value={filters[field.key] ?? ''} onChange={(event) => setFilters({ ...filters, [field.key]: event.target.value })}>
              <option value="">Todos</option>
              {values.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select></label>
          })}
          {dateField && <>
            <label>De<input type="date" value={period.from} max={period.until || undefined} onChange={(event) => setPeriod({ ...period, from: event.target.value })} /></label>
            <label>Até<input type="date" value={period.until} min={period.from || undefined} onChange={(event) => setPeriod({ ...period, until: event.target.value })} /></label>
          </>}
          {hasFilters && <button className="btn btn-secondary" type="button" onClick={clearFilters}>Limpar filtros</button>}
        </div>
        {totals && <dl className="report-metrics financial-metrics">
          <div><dt>Receitas no período</dt><dd>{money.format((totals.receita ?? 0) / 100)}</dd></div>
          <div><dt>Despesas no período</dt><dd>{money.format((totals.despesa ?? 0) / 100)}</dd></div>
          <div><dt>Saldo no período</dt><dd>{money.format(((totals.receita ?? 0) - (totals.despesa ?? 0)) / 100)}</dd></div>
        </dl>}
        {visible.length
          ? <div className="table-scroll records-scroll">
            <table className="records-table" aria-label={definition.title} role="table">
              <thead><tr>{columns.map((field) => <th scope="col" key={field.key}>{field.label}</th>)}
                {resource === 'projetos' && options.tarefas && <th scope="col">Progresso</th>}
                <th scope="col">Ações</th>
              </tr></thead>
              <tbody>{visible.map((item) => {
                const deleteLabel = item.ativo === true ? 'Desativar' : resource === 'eventos' ? 'Cancelar' : 'Excluir'
                const canDelete = permissions.write && item.ativo !== false && !(resource === 'eventos' && item.status === 'cancelado')
                const tasks = options.tarefas?.filter((task) => task.projetoId === item.id && task.status !== 'cancelada') ?? []
                const done = tasks.filter((task) => task.status === 'concluida').length
                return <tr key={item.id} role="row">
                  {columns.map((field) => <td key={field.key} role="cell" className={field.key === definition.labelField ? 'record-name' : undefined}>
                    <span className="mobile-column-label" aria-hidden="true">{field.label}</span>
                    <ResourceCell item={item} field={field} options={options} />
                  </td>)}
                  {resource === 'projetos' && options.tarefas && <td role="cell">
                    <span className="mobile-column-label" aria-hidden="true">Progresso</span>
                    {tasks.length ? <div className="task-progress"><progress max={tasks.length} value={done} aria-label={`${done} de ${tasks.length} tarefas concluídas`} />{done}/{tasks.length}</div> : 'Sem tarefas'}
                  </td>}
                  <td className="record-actions" role="cell"><div className="row-actions">
                    <button className="small-action" type="button" onClick={() => setEditor({ mode: 'view', item })}><CircleHelp size={14} />Detalhes</button>
                    {permissions.write && <button className="small-action" type="button" onClick={() => setEditor({ mode: 'edit', item })}><Pencil size={14} />Editar</button>}
                    {canDelete && <button className="small-action action-danger" type="button" onClick={() => setAction({ type: 'delete', item })}>{deleteLabel}</button>}
                    {(resource === 'pessoas' || resource === 'movimentacoes') && <button className="small-action" type="button" onClick={() => setAction({ type: 'history', item })}><History size={14} />Histórico</button>}
                    {resource === 'usuarios' && permissions.write && item.ativo !== false && <button className="small-action" type="button" onClick={() => setAction({ type: 'recovery', item })}><KeyRound size={14} />Recuperar acesso</button>}
                    {resource === 'escalas' && permissions.write && item.status !== 'substituida' && <button className="small-action" type="button" onClick={() => setAction({ type: 'replace', item })}>Substituir</button>}
                    {resource === 'eventos' && <LinkChamada id={item.id} cancelado={item.status === 'cancelado'} className="small-action" />}
                    {nested.map((link) => <Link className="small-action" key={link.resource} href={queryLink(link.resource, link.key, item.id)}>{link.label}</Link>)}
                  </div></td>
                </tr>
              })}</tbody>
            </table>
            <p className="record-count">{visible.length} {visible.length === 1 ? 'registro' : 'registros'}</p>
          </div>
          : <Empty title="Nenhum registro encontrado" description={hasFilters ? 'Ajuste os filtros para procurar outras opções.' : 'Os novos registros aparecerão nesta lista.'}>
            {hasFilters
              ? <button className="btn btn-secondary" type="button" onClick={clearFilters}>Limpar filtros</button>
              : permissions.write && <button className="btn btn-primary" type="button" onClick={create}><Plus size={17} />Cadastrar primeiro registro</button>}
          </Empty>}
      </>
      : error ? <LoadError error={error} retry={reload} /> : <Loading />}
    {activeEditor && (items || error) && <RegistroEditor resource={resource} editor={activeEditor} options={options} filters={filters} close={() => { setEditor(null); setLinkedEdit(undefined) }} finish={finish} />}
    {action?.type === 'history'
      ? <Historico resource={resource} item={action.item} close={() => setAction(null)} />
      : action && <RegistroAcao resource={resource} action={action} options={options} close={() => setAction(null)} finish={finish} />}
  </>
}
