'use client'

import Link from 'next/link'
import { ClipboardCheck } from 'lucide-react'
import type { SessionUser } from './client-api'
import { useSession } from './gestao-shell'

export function canReadAttendance(permissions: SessionUser['permissions']) {
  return Boolean(permissions.eventos?.read && permissions.pessoas?.read && permissions.inscricoes?.read)
}

export function LinkChamada({ id, cancelado, className }: { id: string; cancelado: boolean; className: string }) {
  const { permissions } = useSession()
  if (!canReadAttendance(permissions)) return null

  return <Link className={className} href={`/eventos/${encodeURIComponent(id)}/presencas`}>
    <ClipboardCheck size={15} aria-hidden="true" />
    {permissions.inscricoes?.write && !cancelado ? 'Registrar presenças' : 'Consultar presenças'}
  </Link>
}
