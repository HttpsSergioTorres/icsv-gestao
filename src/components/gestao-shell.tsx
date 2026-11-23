'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import {
  ArrowRight, CalendarDays, ChartNoAxesCombined, ChevronDown, Church, CircleHelp,
  ClipboardList, Clock3, LayoutDashboard, LogOut, Menu, Network, PanelTop,
  Settings2, ShieldCheck, Tags, Ticket, UserCog, Users, Wallet, X,
} from 'lucide-react'
import type { ResourceName } from '@/lib/domain/resources'
import { api, messageOf, type SessionUser } from './client-api'
import { Marca } from './marca'

const groups = [
  {
    title: 'Visão geral',
    links: [
      { href: '/', label: 'Painel geral', icon: LayoutDashboard },
      { href: '/agenda', label: 'Agenda e eventos', icon: CalendarDays, resource: 'eventos' },
    ],
  },
  {
    title: 'Pessoas e congregações',
    links: [
      { href: '/congregacoes', label: 'Congregações', icon: Church, resource: 'congregacoes' },
      { href: '/pessoas', label: 'Pessoas', icon: Users, resource: 'pessoas' },
      { href: '/ministerios', label: 'Ministérios', icon: Network, resource: 'ministerios' },
      { href: '/equipes', label: 'Equipes', icon: Users, resource: 'equipes' },
    ],
  },
  {
    title: 'Atividades',
    links: [
      { href: '/inscricoes', label: 'Inscrições', icon: Ticket, resource: 'inscricoes' },
      { href: '/servicos', label: 'Tipos de serviço', icon: Settings2, resource: 'servicos' },
      { href: '/escalas', label: 'Escalas', icon: Clock3, resource: 'escalas' },
      { href: '/projetos', label: 'Projetos', icon: PanelTop, resource: 'projetos' },
      { href: '/tarefas', label: 'Tarefas', icon: ClipboardList, resource: 'tarefas' },
    ],
  },
  {
    title: 'Administração',
    links: [
      { href: '/movimentacoes', label: 'Financeiro', icon: Wallet, resource: 'movimentacoes' },
      { href: '/categorias', label: 'Categorias financeiras', icon: Tags, resource: 'categorias' },
      { href: '/relatorios', label: 'Relatórios', icon: ChartNoAxesCombined },
      { href: '/usuarios', label: 'Usuários', icon: UserCog, resource: 'usuarios' },
      { href: '/perfis', label: 'Perfis de acesso', icon: ShieldCheck, resource: 'perfis' },
    ],
  },
] satisfies { title: string; links: { href: string; label: string; icon: typeof Church; resource?: ResourceName }[] }[]

const SessionContext = createContext<SessionUser | null>(null)

export function useSession() {
  const session = useContext(SessionContext)
  if (!session) throw new Error('Sessão indisponível')
  return session
}

export function GestaoShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [user, setUser] = useState<SessionUser | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [open, setOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [logoutError, setLogoutError] = useState('')

  useEffect(() => {
    const controller = new AbortController()

    api<{ user: SessionUser | null }>('/api/auth/session', { signal: controller.signal })
      .then(({ user: currentUser }) => {
        if (!currentUser) router.replace('/login')
        else setUser(currentUser)
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) setError(messageOf(failure, 'Não foi possível verificar sua sessão.'))
      })

    return () => controller.abort()
  }, [attempt, router])

  useEffect(() => {
    if (!open && !profileOpen) return
    function dismiss(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
        setProfileOpen(false)
      }
    }
    window.addEventListener('keydown', dismiss)
    return () => window.removeEventListener('keydown', dismiss)
  }, [open, profileOpen])

  async function signOut() {
    setLeaving(true)
    setLogoutError('')
    try {
      await api('/api/auth/logout', { method: 'POST' })
      router.replace('/login')
      router.refresh()
    } catch (failure) {
      setLogoutError(messageOf(failure, 'Não foi possível encerrar a sessão.'))
      setLeaving(false)
    }
  }

  if (!user) {
    return <div className="initial-state">
      <Marca />
      {error
        ? <><p role="alert">{error}</p><button className="btn btn-primary" onClick={() => { setError(''); setAttempt(attempt + 1) }}>Tentar novamente</button></>
        : <p role="status"><span className="spinner" /> Verificando acesso…</p>}
    </div>
  }

  const currentLink = groups.flatMap(({ links }) => [...links]).find(({ href }) => href === pathname)
  const initials = user.name.trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('')

  return (
    <SessionContext.Provider value={user}>
      <div className="gestao-shell">
        <a className="skip-link" href="#conteudo">Ir para o conteúdo</a>
        {open && <button className="sidebar-overlay" aria-label="Fechar menu" onClick={() => setOpen(false)} />}
        <aside className={`sidebar${open ? ' sidebar-open' : ''}`} id="menu-principal">
          <Link className="sidebar-brand" href="/" onClick={() => setOpen(false)} aria-label="ICSV Gestão, painel geral"><Marca /></Link>
          <button className="icon-button sidebar-close" type="button" aria-label="Fechar menu" onClick={() => setOpen(false)}><X size={20} /></button>
          <nav className="side-nav" aria-label="Navegação principal">
            {groups.map(({ title, links }) => {
              const allowed = links.filter((link) => {
                if (link.href === '/relatorios') return user.canViewReports
                return !('resource' in link) || !link.resource || user.permissions[link.resource]?.read
              })
              if (!allowed.length) return null
              return <section key={title}>
                <h2>{title}</h2>
                <ul>
                  {allowed.map(({ href, label, icon: Icon }) => {
                    const active = pathname === href || (href === '/agenda' && pathname === '/eventos')
                    return <li key={href}><Link href={href} aria-current={active ? 'page' : undefined} onClick={() => setOpen(false)}><Icon size={17} strokeWidth={1.8} />{label}</Link></li>
                  })}
                </ul>
              </section>
            })}
          </nav>
        </aside>
        <div className="work-area">
          <header className="topbar">
            <div className="topbar-left">
              <button className="icon-button menu-toggle" aria-label="Abrir menu" aria-controls="menu-principal" aria-expanded={open} onClick={() => setOpen(!open)}><Menu size={22} /></button>
              <span className="topbar-location"><span>Gestão</span><ArrowRight size={13} aria-hidden="true" /><strong>{currentLink?.label ?? 'Registros'}</strong></span>
            </div>
            <div className="profile">
              <button className="profile-trigger" type="button" aria-label={`Menu da conta de ${user.name}`} aria-expanded={profileOpen} onClick={() => setProfileOpen(!profileOpen)}>
                <span className="avatar" aria-hidden="true">{initials || 'IC'}</span>
                <span className="profile-name">{user.name}<small>{user.role}</small></span>
                <ChevronDown className="profile-chevron" size={15} aria-hidden="true" />
              </button>
              {profileOpen && <div className="profile-popover">
                <p>{user.email}</p>
                <button type="button" className="profile-action" disabled={leaving} onClick={signOut}><LogOut size={16} />{leaving ? 'Saindo…' : 'Sair'}</button>
                {logoutError && <p role="alert">{logoutError}</p>}
              </div>}
            </div>
          </header>
          <main className="page-content" id="conteudo">{children}</main>
        </div>
      </div>
    </SessionContext.Provider>
  )
}

export function AccessDenied() {
  return <div className="state-card">
    <CircleHelp size={28} aria-hidden="true" />
    <h1>Acesso restrito</h1>
    <p>Seu perfil não tem permissão para consultar este módulo.</p>
    <Link className="btn btn-secondary" href="/">Voltar ao painel</Link>
  </div>
}
