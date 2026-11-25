import { eventTime } from '@/lib/domain/occurrences'
import type { ResourceName } from '@/lib/domain/resources'

export interface SessionUser {
  id: string
  name: string
  email: string
  role: string
  grants: string[]
  home: string
  profileId: string
  scope: 'campo' | 'congregacao'
  congregacaoId: string | null
  canViewDashboard: boolean
  canViewReports: boolean
  permissions: Partial<Record<ResourceName, { read: boolean; write: boolean }>>
}

export interface RecordItem {
  id: string
  [key: string]: unknown
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

export async function api<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (typeof init.body === 'string') headers.set('Content-Type', 'application/json')

  const response = await fetch(url, {
    ...init,
    headers,
    cache: 'no-store',
    credentials: 'same-origin',
  })

  const result = response.status === 204 ? undefined : await response.json().catch(() => undefined)

  if (!response.ok) {
    throw new ApiError(response.status, typeof result?.error === 'string' ? result.error : 'Não foi possível completar a solicitação.')
  }

  return result as T
}

export function messageOf(error: unknown, fallback = 'Não foi possível carregar os dados.') {
  return error instanceof Error && error.message !== 'Failed to fetch' ? error.message : fallback
}

export function write(method: 'POST' | 'PATCH', body: unknown): RequestInit {
  return { method, body: JSON.stringify(body) }
}

export const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
export const integer = new Intl.NumberFormat('pt-BR')
export const dateTime = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
})

export function formatDate(value: unknown) {
  const match = typeof value === 'string' && /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '—'
}

export function formatDateTime(value: unknown) {
  if (typeof value !== 'string') return '—'
  const date = new Date(eventTime(value))
  return Number.isNaN(date.getTime()) ? '—' : dateTime.format(date)
}

export function downloadCsv(filename: string, rows: string[][]) {
  // Preserve text cells when opened in a spreadsheet, including user-entered values.
  const csv = rows.map((row) => row.map((cell) => {
    const text = /^\s*[=+\-@]|^[\t\r]/.test(cell) ? `'${cell}` : cell
    return `"${text.replaceAll('"', '""')}"`
  }).join(';')).join('\r\n')
  const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
