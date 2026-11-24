import type { Metadata } from 'next'
import { Chamada } from '@/components/chamada'
import '@/components/chamada.css'

export const metadata: Metadata = { title: 'Chamada interna | ICSV Gestão' }

export default async function ChamadaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <Chamada key={id} id={id} />
}
