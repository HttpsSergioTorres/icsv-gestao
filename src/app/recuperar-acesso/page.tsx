import type { Metadata } from 'next'
import { TelaRecuperacao } from '@/components/acesso'
import '@/components/gestao.css'

export const metadata: Metadata = { title: 'Recuperar acesso | ICSV Gestão' }

export default function RecoveryPage() {
  return <TelaRecuperacao />
}
