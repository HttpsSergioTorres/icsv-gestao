import type { ReactNode } from 'react'
import { GestaoShell } from '@/components/gestao-shell'
import '@/components/gestao.css'

export default function Layout({ children }: { children: ReactNode }) {
  return <GestaoShell>{children}</GestaoShell>
}
