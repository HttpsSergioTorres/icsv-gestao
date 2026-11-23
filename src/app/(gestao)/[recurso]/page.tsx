import { notFound } from 'next/navigation'
import { Recursos } from '@/components/recursos'
import { isResourceName, resources } from '@/lib/domain/resources'

type Query = Record<string, string | string[] | undefined>

export default async function RecursoPage({ params, searchParams }: {
  params: Promise<{ recurso: string }>
  searchParams: Promise<Query>
}) {
  const [{ recurso }, query] = await Promise.all([params, searchParams])
  if (!isResourceName(recurso)) notFound()

  const keys = resources[recurso].fields.map(({ key }) => key)
  const filters = Object.fromEntries(Object.entries(query).filter(
    (entry): entry is [string, string] => keys.includes(entry[0]) && typeof entry[1] === 'string',
  ))
  const initialEdit = typeof query.editar === 'string' ? query.editar : undefined
  const startNew = query.novo === '1'

  return <Recursos key={`${recurso}:${JSON.stringify(filters)}:${initialEdit}:${startNew}`} resource={recurso} initialFilters={filters} initialEdit={initialEdit} startNew={startNew} />
}
