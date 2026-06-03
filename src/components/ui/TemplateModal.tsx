'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export type TemplateModalProps = {
  /** Si el modal está visible. */
  open: boolean
  /** Callback al cerrar (backdrop, Escape o botón). */
  onClose: () => void
  /** Título en cabecera petróleo. */
  title: string
  /** Contenido scrollable del modal. */
  children: ReactNode
  /** Pie opcional (acciones, botones). */
  footer?: ReactNode
  /** Etiqueta accesible; por defecto usa `title`. */
  ariaLabel?: string
  /** Clases extra en el panel principal. */
  className?: string
  /** Clases extra en la zona scrollable. */
  contentClassName?: string
  /** Destino del portal; por defecto `document.body`. */
  portalTarget?: HTMLElement | null
}

/**
 * Plantilla de referencia para nuevos modales compatibles con `ModalChromeWatcher`.
 *
 * Copia este componente o usa su estructura HTML al crear modales ad-hoc.
 * NO manipules `document.body.style.overflow` — el bloqueo de scroll es SSOT vía watcher.
 */
export function TemplateModal({
  open,
  onClose,
  title,
  children,
  footer,
  ariaLabel,
  className,
  contentClassName,
  portalTarget,
}: TemplateModalProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !mounted) return null

  const target = portalTarget ?? (typeof document !== 'undefined' ? document.body : null)
  if (!target) return null

  const label = ariaLabel ?? title
  const titleId = 'template-modal-title'

  return createPortal(
    <>
      <div
        data-marbella-modal-overlay="true"
        className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-label={label}
        className="fixed inset-0 z-[101] flex items-end justify-center p-0 pointer-events-none sm:items-center sm:p-4"
      >
        <div
          className={cn(
            'pointer-events-auto flex w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-zinc-100 bg-white shadow-2xl',
            'max-h-[92vh] sm:rounded-2xl animate-in zoom-in-95 duration-200',
            className
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <header className="flex shrink-0 items-center justify-between gap-3 bg-[#36606F] px-4 py-3 text-white">
            <h2 id={titleId} className="text-sm font-black uppercase tracking-wider leading-tight pr-2">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="inline-flex min-h-12 min-w-12 shrink-0 items-center justify-center rounded-xl text-white transition-colors hover:bg-white/15 active:scale-95"
            >
              <X className="h-5 w-5" strokeWidth={2.5} />
            </button>
          </header>

          <div
            className={cn(
              'min-h-0 flex-1 overflow-y-auto overscroll-contain p-4',
              contentClassName
            )}
          >
            {children}
          </div>

          {footer ? (
            <footer className="shrink-0 border-t border-zinc-100 bg-white p-4">{footer}</footer>
          ) : null}
        </div>
      </div>
    </>,
    target
  )
}
