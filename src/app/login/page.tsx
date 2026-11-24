import type { Metadata } from 'next'
import { TelaLogin } from '@/components/acesso'
import '@/components/gestao.css'

export const metadata: Metadata = { title: 'Acesso | ICSV Gestão' }

export default async function LoginPage({ searchParams }: {
  searchParams: Promise<{ senha?: string | string[] }>
}) {
  const { senha } = await searchParams
  return <TelaLogin senhaAlterada={senha === 'alterada'} />
}
