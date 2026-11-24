'use client'

import Link from 'next/link'
import { useEffect, useState, type FormEvent } from 'react'
import { ArrowLeft, ClipboardCheck, Repeat2 } from 'lucide-react'
import { ApiError, api, messageOf, write } from './client-api'
import { AccessDenied, useSession } from './gestao-shell'
import { canReadAttendance } from './link-chamada'
import { Modal } from './modal'
import { Empty, LoadError, Loading, PageHeading } from './painel'

type AttendanceStatus = 'presente' | 'ausente'
type RegistrationStatus = AttendanceStatus | 'inscrito' | 'confirmado' | 'cancelado'
type Participant = { id: string; pessoa: string; status: RegistrationStatus }
type AttendanceData = {
  evento: { id: string; titulo: string; status: string; recorrencia?: string | null }
  participantes: Participant[]
}

const labels: Record<RegistrationStatus, string> = {
  inscrito: 'Inscrito',
  confirmado: 'Confirmado',
  presente: 'Presente',
  ausente: 'Ausente',
  cancelado: 'Inscrição cancelada',
}

function savedChoice(status: RegistrationStatus) {
  return status === 'presente' || status === 'ausente' ? status : ''
}

function countStatus(participants: Participant[], ...statuses: RegistrationStatus[]) {
  return participants.filter(({ status }) => statuses.includes(status)).length
}

export function Chamada({ id }: { id: string }) {
  const { permissions } = useSession()
  const canRead = canReadAttendance(permissions)
  const endpoint = `/api/eventos/${encodeURIComponent(id)}/presencas`
  const [data, setData] = useState<AttendanceData>()
  const [loadError, setLoadError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [changes, setChanges] = useState<Record<string, AttendanceStatus>>({})
  const [reviewing, setReviewing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [conflict, setConflict] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (!canRead) return
    const aborter = new AbortController()
    api<AttendanceData>(endpoint, { signal: aborter.signal }).then((response) => {
      if (!aborter.signal.aborted) setData(response)
    }).catch((failure: unknown) => {
      if (!aborter.signal.aborted) setLoadError(messageOf(failure, 'Não foi possível carregar a chamada.'))
    })
    return () => aborter.abort()
  }, [attempt, canRead, endpoint])

  const canceled = data?.evento.status === 'cancelado'
  const mayEdit = Boolean(permissions.inscricoes?.write) && !canceled
  const pending = data?.participantes.flatMap((participant) => {
    const status = changes[participant.id]
    return status ? [{ participant, status }] : []
  }) ?? []

  function retryLoad() {
    setLoadError('')
    setAttempt((current) => current + 1)
  }

  function reloadAfterConflict() {
    setConflict(false)
    setSaveError('')
    setChanges({})
    setReviewing(false)
    setData(undefined)
    retryLoad()
  }

  function choose(participant: Participant, status: string) {
    setNotice('')
    setChanges((previous) => {
      const next = { ...previous }
      if ((status === 'presente' || status === 'ausente') && status !== participant.status) {
        next[participant.id] = status
      } else {
        delete next[participant.id]
      }
      return next
    })
  }

  function showReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (conflict || !mayEdit || !pending.length) return
    setSaveError('')
    setReviewing(true)
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || conflict || !mayEdit || !pending.length) return
    setBusy(true)
    setSaveError('')
    try {
      const alteracoes = pending.map(({ participant, status }) => ({
        id: participant.id,
        statusAnterior: participant.status,
        status,
      }))
      await api<void>(endpoint, write('PATCH', { alteracoes }))
      setChanges({})
      setReviewing(false)
      setData(undefined)
      setNotice('Chamada salva.')
      retryLoad()
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 409) setConflict(true)
      setSaveError(messageOf(failure, 'Não foi possível salvar a chamada. Tente novamente.'))
    } finally {
      setBusy(false)
    }
  }

  if (!canRead) return <AccessDenied />

  const participants = data?.participantes ?? []
  const recurring = Boolean(data?.evento.recorrencia && data.evento.recorrencia !== 'nenhuma')

  return <>
    <PageHeading title="Chamada interna" description={data?.evento.titulo}>
      <Link href="/eventos" className="btn btn-secondary"><ArrowLeft size={16} aria-hidden="true" />Voltar às atividades</Link>
    </PageHeading>
    {notice && <p role="status" className="success-banner">{notice}</p>}
    {loadError && <LoadError error={loadError} retry={retryLoad} />}
    {!loadError && !data && <Loading />}
    {data && <>
      {recurring && <p className="chamada-note"><Repeat2 size={17} aria-hidden="true" />A chamada é compartilhada por toda a série recorrente.</p>}
      {canceled && <p className="chamada-note chamada-warning">Atividade cancelada. A chamada está disponível para consulta.</p>}
      {participants.length ? <>
        <dl className="report-metrics chamada-summary" aria-label="Resumo da chamada salva">
          <div><dt>Inscrições</dt><dd>{participants.length}</dd></div>
          <div><dt>Presentes</dt><dd>{countStatus(participants, 'presente')}</dd></div>
          <div><dt>Ausentes</dt><dd>{countStatus(participants, 'ausente')}</dd></div>
          <div><dt>Aguardando chamada</dt><dd>{countStatus(participants, 'inscrito', 'confirmado')}</dd></div>
          <div><dt>Inscrições canceladas</dt><dd>{countStatus(participants, 'cancelado')}</dd></div>
        </dl>
        <form onSubmit={showReview}>
          <div className="table-scroll records-scroll">
            <table className="records-table chamada-table" aria-label="Participantes da atividade" role="table">
              <thead><tr>
                <th scope="col">Participante</th>
                <th scope="col">Situação salva</th>
                {mayEdit && <th scope="col">Chamada</th>}
              </tr></thead>
              <tbody>{participants.map((participant) => (
                <tr key={participant.id} role="row">
                  <th className="record-name" scope="row">{participant.pessoa}</th>
                  <td role="cell">
                    <span className="mobile-column-label" aria-hidden="true">Situação salva</span>
                    <span className="record-status" data-status={participant.status}>{labels[participant.status]}</span>
                  </td>
                  {mayEdit && <td role="cell">
                    <span className="mobile-column-label" aria-hidden="true">Chamada</span>
                    {participant.status === 'cancelado'
                      ? <span>—</span>
                      : <select aria-label={`Presença de ${participant.pessoa}`} disabled={conflict} value={changes[participant.id] ?? savedChoice(participant.status)}
                        onChange={(event) => choose(participant, event.target.value)}>
                        {!savedChoice(participant.status) && <option value="">Manter {labels[participant.status].toLowerCase()}</option>}
                        <option value="presente">Presente</option>
                        <option value="ausente">Ausente</option>
                      </select>}
                  </td>}
                </tr>
              ))}</tbody>
            </table>
          </div>
          {conflict
            ? !reviewing && <>
              <p role="alert" className="alert">{saveError} Recarregar descarta as alterações pendentes.</p>
              <div className="chamada-footer">
                <button type="button" className="btn btn-primary" onClick={reloadAfterConflict}>Recarregar chamada</button>
              </div>
            </>
            : mayEdit && participants.some(({ status }) => status !== 'cancelado') && <div className="chamada-footer">
              <p role="status">{pending.length === 1 ? '1 alteração pendente' : `${pending.length} alterações pendentes`}</p>
              <button type="submit" className="btn btn-primary" disabled={!pending.length}><ClipboardCheck size={17} aria-hidden="true" />Revisar alterações</button>
            </div>}
        </form>
      </> : <Empty title="Nenhuma inscrição nesta atividade" description={mayEdit ? 'Cadastre participantes para registrar a presença.' : undefined} />}
    </>}
    {reviewing && <Modal title="Confirmar presença" close={() => { if (!busy) setReviewing(false) }}>
      <form onSubmit={save}>
        <p className="modal-note">Confira as alterações antes de salvar a chamada.</p>
        <ul className="chamada-review">{pending.map(({ participant, status }) => (
          <li key={participant.id}><strong>{participant.pessoa}</strong><span>{labels[participant.status]} → {labels[status]}</span></li>
        ))}</ul>
        {saveError && <p role="alert" className="alert">{saveError}{conflict && ' Recarregar descarta as alterações pendentes.'}</p>}
        <footer className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={() => setReviewing(false)} disabled={busy}>Voltar</button>
          {conflict
            ? <button type="button" className="btn btn-primary" onClick={reloadAfterConflict}>Recarregar chamada</button>
            : <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar chamada'}</button>}
        </footer>
      </form>
    </Modal>}
  </>
}
