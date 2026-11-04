'use client'

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

/**
 * El visor ocupa exactamente 1, 2, 3... filas completas.
 * La altura se deriva de las filas renderizadas: cubre diferentes tamaños
 * de móvil, rotación, traducciones y fotografías de tamaño variable.
 * El scroll nativo mantiene el gesto táctil y ajusta la parada al inicio de fila.
 */
export function CartaWholeRowScroller({
  enabled,
  resetKey,
  children,
  footer,
}: {
  enabled: boolean
  resetKey: string
  children: ReactNode
  footer?: ReactNode
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const footerRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const [viewportHeight, setViewportHeight] = useState<number | null>(null)
  const [hintState, setHintState] = useState<{ key: string; more: boolean }>({
    key: resetKey,
    more: false,
  })

  useLayoutEffect(() => {
    if (!enabled) return
    const host = hostRef.current
    const list = listRef.current
    const viewport = viewportRef.current
    if (!host || !list || !viewport) return

    viewport.scrollTop = 0
    let raf = 0
    const update = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const rows = Array.from(list.querySelectorAll<HTMLElement>('.carta-product-grid-row'))
        const availableHeight = host.clientHeight
        if (availableHeight < 1 || rows.length === 0) {
          setViewportHeight(null)
          return
        }

        const origin = list.getBoundingClientRect().top
        let fitted = 0
        for (const row of rows) {
          const bottom = row.getBoundingClientRect().bottom - origin
          if (bottom > availableHeight + 0.5) break
          fitted = bottom
        }

        // Si todos los productos y la nota caben, mostrarla inmediatamente
        // debajo de la última fila, nunca pegada al fondo de la pantalla.
        const footerBottom = footerRef.current
          ? footerRef.current.getBoundingClientRect().bottom - origin
          : null
        if (footerBottom != null && footerBottom <= availableHeight + 0.5) {
          fitted = footerBottom
        }

        const firstBottom = rows[0].getBoundingClientRect().bottom - origin
        const next = Math.round(Math.min(availableHeight, fitted || firstBottom))
        setViewportHeight((previous) => (previous === next ? previous : next))
      })
    }

    const observer = new ResizeObserver(update)
    observer.observe(host)
    observer.observe(list)
    for (const row of list.querySelectorAll<HTMLElement>('.carta-product-grid-row')) {
      observer.observe(row)
    }
    update()
    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
    }
  }, [enabled, resetKey])

  useLayoutEffect(() => {
    if (!enabled) return
    const viewport = viewportRef.current
    const list = listRef.current
    if (!viewport || !list) return

    const syncIndicator = () => {
      const more = viewport.scrollHeight > viewport.clientHeight + 3
        && viewport.scrollTop + viewport.clientHeight < viewport.scrollHeight - 3
      setHintState(previous =>
        previous.key === resetKey && previous.more === more
          ? previous
          : { key: resetKey, more }
      )
    }
    const resizeObserver = new ResizeObserver(syncIndicator)
    resizeObserver.observe(viewport)
    resizeObserver.observe(list)
    viewport.addEventListener('scroll', syncIndicator, { passive: true })
    const initialFrame = requestAnimationFrame(syncIndicator)
    return () => {
      cancelAnimationFrame(initialFrame)
      resizeObserver.disconnect()
      viewport.removeEventListener('scroll', syncIndicator)
    }
  }, [enabled, resetKey, viewportHeight])

  if (!enabled) return <>{children}{footer}</>

  return (
    <div ref={hostRef} className="carta-whole-row-host relative flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      <div
        ref={viewportRef}
        className="carta-whole-row-scroll w-full overflow-y-auto overscroll-contain custom-scrollbar"
        style={{ height: viewportHeight == null ? '100%' : String(viewportHeight) + 'px', maxHeight: '100%' }}
        tabIndex={0}
        role="region"
        aria-label="Productos de la sección"
      >
        <div ref={listRef}>
          {children}
          {footer ? <div ref={footerRef}>{footer}</div> : null}
        </div>
      </div>
      {hintState.key === resetKey && hintState.more ? (
        <div
          className="carta-scroll-more-hint pointer-events-none absolute inset-x-0 bottom-0 z-10 flex h-5 items-center justify-center text-white/65"
          data-carta-scroll-more="true"
          aria-hidden="true"
        >
          <ChevronDown className="h-4 w-4" strokeWidth={1.8} />
        </div>
      ) : null}
    </div>
  )
}
