'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { Bell, Check, HeartHandshake, Plus, ShieldCheck, X } from 'lucide-react'
import { api, formatDateTime, messageOf, write } from './client-api'
import { useSession } from './gestao-shell'
import { Modal } from './modal'
import './comunicacao.css'

type Audience = 'geral' | 'kids'
type Status = 'pendente' | 'aprovado' | 'rejeitado'
type Decision = Exclude<Status, 'pendente'>
type Notice = { id: string; titulo: string; texto: string; publico: 'todos' | Audience; criadoEm: string }
type Prayer = { id: string; texto: string; anonimo: boolean; criadoEm: string }
type PublicPrayer = Prayer & { autor: string | null }
type OwnPrayer = Prayer & { status: Status }
type ModerationPrayer = PublicPrayer & OwnPrayer & { publico: Audience }
type Feed = {
  avisos: Notice[]
  pedidos: PublicPrayer[]
  meusPedidos: OwnPrayer[]
  permissions: { publish: boolean; moderate: boolean }
}

const statusLabels = { pendente: 'Pendente', aprovado: 'Aprovado', rejeitado: 'Rejeitado' }

function NoticeForm({ onSaved, close }: { onSaved: () => void; close: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const fields = new FormData(event.currentTarget)
    setBusy(true)
    setError('')
    try {
      await api('/api/comunicacao/avisos', write('POST', {
        titulo: fields.get('titulo'),
        texto: fields.get('texto'),
        publico: fields.get('publico'),
      }))
      onSaved()
    } catch (failure) {
      setError(messageOf(failure, 'Não foi possível publicar o aviso.'))
      setBusy(false)
    }
  }

  return <Modal title="Publicar aviso" close={() => { if (!busy) close() }}>
    <form className="comunicacao-form" onSubmit={save}>
      <label>Título<input name="titulo" required maxLength={120} /></label>
      <label>Aviso<textarea name="texto" required rows={4} maxLength={1500} /></label>
      <label>Público
        <select name="publico" defaultValue="geral">
          <option value="geral">Perfis gerais</option>
          <option value="kids">Somente Kids</option>
          <option value="todos">Todos, inclusive Kids</option>
        </select>
      </label>
      {error && <p className="alert" role="alert">{error}</p>}
      <footer className="modal-actions">
        <button className="btn btn-secondary" type="button" onClick={close} disabled={busy}>Cancelar</button>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Publicando…' : 'Publicar'}</button>
      </footer>
    </form>
  </Modal>
}

function PrayerForm({ kids, onSaved, close }: { kids: boolean; onSaved: () => void; close: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const fields = new FormData(event.currentTarget)
    setBusy(true)
    setError('')
    try {
      await api('/api/comunicacao/pedidos', write('POST', {
        texto: fields.get('texto'), anonimo: fields.get('identificacao') === 'anonimo',
      }))
      onSaved()
    } catch (failure) {
      setError(messageOf(failure, 'Não foi possível enviar o pedido.'))
      setBusy(false)
    }
  }

  return <Modal title="Enviar pedido de oração" close={() => { if (!busy) close() }}>
    <form className="comunicacao-form" onSubmit={save}>
      <label>{kids ? 'Como podemos orar por você?' : 'Seu pedido'}<textarea name="texto" required rows={4} maxLength={1200} /></label>
      <fieldset className="comunicacao-identity" aria-describedby="oracao-privacidade">
        <legend>Identificação no mural</legend>
        <label><input type="radio" name="identificacao" value="identificado" />Com identificação</label>
        <label><input type="radio" name="identificacao" value="anonimo" defaultChecked />Anônimo</label>
      </fieldset>
      <p id="oracao-privacidade" className="comunicacao-meta">
        O pedido fica pendente até a revisão. A moderação autorizada pode consultar quem enviou, inclusive quando você escolher Anônimo.
      </p>
      {error && <p className="alert" role="alert">{error}</p>}
      <footer className="modal-actions">
        <button className="btn btn-secondary" type="button" onClick={close} disabled={busy}>Cancelar</button>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Enviando…' : 'Enviar pedido'}</button>
      </footer>
    </form>
  </Modal>
}

function ModerationPanel({ onSaved }: { onSaved: () => void }) {
  const [data, setData] = useState<ModerationPrayer[]>()
  const [loadError, setLoadError] = useState('')
  const [revision, setRevision] = useState(0)
  const [chosen, setChosen] = useState<{ item: ModerationPrayer; status: Decision }>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const abort = new AbortController()
    api<{ pedidos: ModerationPrayer[] }>('/api/comunicacao/moderacao', { signal: abort.signal })
      .then(({ pedidos }) => { if (!abort.signal.aborted) setData(pedidos) })
      .catch((failure: unknown) => {
        if (!abort.signal.aborted) setLoadError(messageOf(failure, 'Não foi possível carregar a moderação.'))
      })
    return () => abort.abort()
  }, [revision])

  function load() {
    setLoadError('')
    setRevision((value) => value + 1)
  }

  async function decide(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!chosen || busy) return
    setBusy(true)
    setError('')
    try {
      await api(`/api/comunicacao/moderacao/${chosen.item.id}`, write('PATCH', { status: chosen.status }))
      setData((current) => current?.map((item) => item.id === chosen.item.id ? { ...item, status: chosen.status } : item))
      setChosen(undefined)
      onSaved()
      load()
    } catch (failure) {
      setError(messageOf(failure, 'Não foi possível registrar a decisão.'))
      load()
    } finally {
      setBusy(false)
    }
  }

  function choose(item: ModerationPrayer, status: Decision) {
    setError('')
    setChosen({ item, status })
  }

  return <div className="comunicacao-moderacao">
    <h3>Moderação dos pedidos</h3>
    {loadError && <p role="alert" className="alert">{loadError} <button className="btn btn-secondary" type="button" onClick={load}>Tentar novamente</button></p>}
    {!data && !loadError && <p role="status">Carregando moderação…</p>}
    {data?.length === 0 && <p className="comunicacao-empty">Nenhum pedido para consultar.</p>}
    {data && data.length > 0 && <ul className="comunicacao-list">
      {data.map((item) => <li key={item.id}>
        <div className="comunicacao-item-heading">
          <strong>{item.autor ?? 'Conta indisponível'}</strong><span className="comunicacao-status" data-status={item.status}>{statusLabels[item.status]}</span>
        </div>
        <p className="comunicacao-meta">{item.publico === 'kids' ? 'Kids' : 'Perfis gerais'}{item.anonimo && ' · Anônimo no mural'}</p>
        <p className="comunicacao-body">{item.texto}</p>
        {item.status === 'pendente' && <div className="comunicacao-decisoes">
          <button className="btn btn-primary" type="button" onClick={() => choose(item, 'aprovado')}><Check size={16} aria-hidden="true" />Aprovar</button>
          <button className="btn btn-secondary" type="button" onClick={() => choose(item, 'rejeitado')}><X size={16} aria-hidden="true" />Rejeitar</button>
        </div>}
      </li>)}
    </ul>}
    {chosen && <Modal title={chosen.status === 'aprovado' ? 'Aprovar pedido' : 'Rejeitar pedido'} close={() => { if (!busy) setChosen(undefined) }}>
      <form onSubmit={decide}>
        <p className="comunicacao-body">{chosen.item.texto}</p>
        <p className="comunicacao-meta">{chosen.status === 'aprovado' ? 'O pedido será exibido no mural do público correspondente.' : 'O pedido ficará fora do mural.'}</p>
        {error && <p role="alert" className="alert">{error}</p>}
        <footer className="modal-actions">
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setChosen(undefined)}>Voltar</button>
          <button className={chosen.status === 'aprovado' ? 'btn btn-primary' : 'btn btn-danger'} disabled={busy}>{busy ? 'Salvando…' : 'Confirmar decisão'}</button>
        </footer>
      </form>
    </Modal>}
  </div>
}

function CommunicationPanels({ audience }: { audience?: 'kids' }) {
  const [feed, setFeed] = useState<Feed>()
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [revision, setRevision] = useState(0)
  const [form, setForm] = useState<'aviso' | 'pedido'>()
  const [moderationOpen, setModerationOpen] = useState(false)
  const kids = audience === 'kids'

  useEffect(() => {
    const abort = new AbortController()
    api<Feed>('/api/comunicacao', { signal: abort.signal })
      .then((data) => { if (!abort.signal.aborted) setFeed(data) })
      .catch((failure: unknown) => {
        if (!abort.signal.aborted) setError(messageOf(failure, 'Não foi possível carregar a comunicação.'))
      })
    return () => abort.abort()
  }, [revision])

  function load() {
    setError('')
    setRevision((value) => value + 1)
  }

  function saved(text: string) {
    setForm(undefined)
    setNotice(text)
    load()
  }

  return <div className={kids ? 'comunicacao-grid comunicacao-kids' : 'comunicacao-grid'}>
    {notice && <p className="success-banner comunicacao-wide" role="status">{notice}</p>}
    {error && <div className="alert comunicacao-wide" role="alert">{error} <button className="btn btn-secondary" type="button" onClick={load}>Tentar novamente</button></div>}
    {!feed && !error && <p className="comunicacao-meta comunicacao-wide" role="status">Carregando avisos e pedidos…</p>}
    <section className="comunicacao-card" id="mural-avisos" aria-labelledby="comunicacao-avisos-heading">
      <header className="comunicacao-heading">
        <span className="comunicacao-icon" aria-hidden="true"><Bell size={21} /></span>
        <h2 id="comunicacao-avisos-heading">{kids ? 'Avisos do Kids' : 'Mural de lembretes e avisos'}</h2>
      </header>
      {feed?.permissions.publish && <button className="btn btn-secondary" type="button" onClick={() => setForm('aviso')}><Plus size={16} aria-hidden="true" />Publicar aviso</button>}
      {feed && (feed.avisos.length ? <ul className="comunicacao-list">
        {feed.avisos.map((item) => <li key={item.id}>
          <div className="comunicacao-item-heading"><h3>{item.titulo}</h3><time dateTime={item.criadoEm}>{formatDateTime(item.criadoEm)}</time></div>
          <p className="comunicacao-body">{item.texto}</p>
        </li>)}
      </ul> : <p className="comunicacao-empty">Nenhum aviso por aqui.</p>)}
    </section>

    <section className="comunicacao-card" id="pedidos-oracao" aria-labelledby="comunicacao-oracoes-heading">
      <header className="comunicacao-heading">
        <span className="comunicacao-icon" aria-hidden="true"><HeartHandshake size={21} /></span>
        <h2 id="comunicacao-oracoes-heading">Pedidos de oração</h2>
      </header>
      {feed && <>
        <div className="comunicacao-actions">
          <button className="btn btn-primary" type="button" onClick={() => setForm('pedido')}><Plus size={16} aria-hidden="true" />Novo pedido</button>
          {feed.permissions.moderate && <button className="btn btn-secondary" type="button" aria-expanded={moderationOpen}
            onClick={() => setModerationOpen((open) => !open)}><ShieldCheck size={17} aria-hidden="true" />{moderationOpen ? 'Fechar moderação' : 'Moderar pedidos'}</button>}
        </div>
        {feed.pedidos.length ? <ul className="comunicacao-list" aria-label="Pedidos aprovados">
          {feed.pedidos.map((item) => <li key={item.id}>
            <p className="comunicacao-body">{item.texto}</p>
            <p className="comunicacao-meta">{item.anonimo ? 'Anônimo' : item.autor ?? 'Conta indisponível'}</p>
          </li>)}
        </ul> : <p className="comunicacao-empty">Nenhum pedido publicado.</p>}
        {feed.meusPedidos.length > 0 && <details className="comunicacao-pedidos">
          <summary>Meus pedidos</summary>
          <ul className="comunicacao-list">{feed.meusPedidos.map((item) => <li key={item.id}>
            <div className="comunicacao-item-heading"><time dateTime={item.criadoEm}>{formatDateTime(item.criadoEm)}</time>
              <span className="comunicacao-status" data-status={item.status}>{statusLabels[item.status]}</span></div>
            <p className="comunicacao-body">{item.texto}</p>
          </li>)}</ul>
        </details>}
        {moderationOpen && feed.permissions.moderate && <ModerationPanel onSaved={() => saved('Decisão registrada.')} />}
      </>}
    </section>

    {form === 'aviso' && feed?.permissions.publish && <NoticeForm close={() => setForm(undefined)} onSaved={() => saved('Aviso publicado.')} />}
    {form === 'pedido' && feed && <PrayerForm kids={kids} close={() => setForm(undefined)} onSaved={() => saved('Pedido enviado para moderação.')} />}
  </div>
}

export function ComunicacaoHome({ audience }: { audience?: 'kids' }) {
  const user = useSession()
  return <CommunicationPanels key={`${user.id}:${user.profileId}:${user.congregacaoId}:${audience}`} audience={audience} />
}
