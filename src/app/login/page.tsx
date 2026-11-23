import type { Metadata } from 'next'
import { TelaLogin } from '@/components/acesso'
import '@/components/gestao.css'

export const metadata: Metadata = { title: 'Acesso | ICSV Gestão' }

export default function LoginPage() {
  return <TelaLogin />
}
