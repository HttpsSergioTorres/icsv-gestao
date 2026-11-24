'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, type ReactNode, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, Eye, EyeOff, LockKeyhole } from 'lucide-react'
import { api, messageOf, write } from './client-api'
import { Marca } from './marca'

function AcessoLayout({ children }: { children: ReactNode }) {
  return <main className="auth-layout">
    <section className="auth-brand">
      <Link href="/"><Marca /></Link>
      <div className="auth-brand-copy">
        <h1>Igreja de Cristo no Brasil</h1>
        <p>Administração das congregações, dos ministérios e das atividades do Campo San Vale.</p>
      </div>
      <div className="auth-brand-motif" aria-hidden="true"><span /><span /><span /></div>
    </section>
    <div className="auth-content">{children}</div>
  </main>
}

export function TelaLogin({ senhaAlterada }: { senhaAlterada: boolean }) {
  const router = useRouter()
  const [shown, setShown] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setError('')
    setBusy(true)
    try {
      await api('/api/auth/login', write('POST', { email: data.get('email'), password: data.get('password') }))
      router.replace('/')
      router.refresh()
    } catch (failure) {
      setError(messageOf(failure, 'Não foi possível entrar. Tente novamente.'))
      setBusy(false)
    }
  }

  return <AcessoLayout>
    <section className="auth-card" aria-labelledby="login-title">
      <span className="auth-mark"><LockKeyhole size={22} aria-hidden="true" /></span>
      <h2 id="login-title">Acesse sua conta</h2>
      <p>Entre para acessar o ICSV Gestão.</p>
      {senhaAlterada && <p className="success-banner" role="status">Senha alterada. Entre novamente com a nova senha.</p>}
      <form onSubmit={submit}>
        <label htmlFor="email">E-mail</label>
        <input name="email" id="email" autoComplete="username" type="email" placeholder="voce@exemplo.com" required />
        <label htmlFor="password">Senha</label>
        <div className="password-input">
          <input name="password" id="password" autoComplete="current-password" type={shown ? 'text' : 'password'} required />
          <button type="button" className="icon-button" aria-label={shown ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setShown(!shown)}>{shown ? <EyeOff size={18} /> : <Eye size={18} />}</button>
        </div>
        <Link className="auth-recover" href="/recuperar-acesso">Esqueci minha senha</Link>
        {error && <p className="alert" role="alert">{error}</p>}
        <button className="btn btn-primary auth-submit" type="submit" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}<ArrowRight size={18} aria-hidden="true" /></button>
      </form>
    </section>
  </AcessoLayout>
}

export function TelaRecuperacao() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setError('')
    if (data.get('password') !== data.get('repeatPassword')) {
      setError('Digite a mesma senha nos dois campos.')
      return
    }
    setBusy(true)
    try {
      await api('/api/auth/reset', write('POST', { token: String(data.get('token')).trim(), password: data.get('password') }))
      setDone(true)
    } catch (failure) {
      setError(messageOf(failure, 'Não foi possível redefinir a senha.'))
    } finally {
      setBusy(false)
    }
  }

  return <AcessoLayout>
    <section className="auth-card" aria-labelledby="recover-title">
      <span className="auth-mark"><LockKeyhole size={22} aria-hidden="true" /></span>
      <h2 id="recover-title">Recuperar acesso</h2>
      {done
        ? <><p role="status">Senha redefinida. Você já pode entrar com a nova senha.</p><Link className="btn btn-primary" href="/login">Ir para o login<ArrowRight size={18} /></Link></>
        : <>
          <p>Solicite um código ao administrador e escolha uma senha com ao menos 8 caracteres.</p>
          <form onSubmit={submit}>
            <label htmlFor="recovery-code">Código de recuperação</label>
            <input name="token" id="recovery-code" type="text" autoComplete="one-time-code" spellCheck={false} required />
            <label htmlFor="new-password">Nova senha</label>
            <input name="password" id="new-password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required />
            <label htmlFor="repeat-password">Confirmar nova senha</label>
            <input name="repeatPassword" id="repeat-password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required />
            {error && <p className="alert" role="alert">{error}</p>}
            <button className="btn btn-primary auth-submit" type="submit" disabled={busy}>{busy ? 'Redefinindo…' : 'Redefinir senha'}<ArrowRight size={18} aria-hidden="true" /></button>
            <Link className="auth-back" href="/login"><ArrowLeft size={16} aria-hidden="true" />Voltar ao login</Link>
          </form>
        </>}
    </section>
  </AcessoLayout>
}
