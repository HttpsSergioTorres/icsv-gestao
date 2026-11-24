'use client'

import { useEffect, useId, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

export function Modal({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const heading = useId()
  useEffect(() => {
    const dialog = ref.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])

  return <dialog className="modal" ref={ref} aria-labelledby={heading} onCancel={(event) => { event.preventDefault(); close() }}>
    <div className="modal-content">
      <header><h2 id={heading}>{title}</h2><button type="button" className="icon-button" aria-label="Fechar" onClick={close}><X size={20} /></button></header>
      {children}
    </div>
  </dialog>
}
