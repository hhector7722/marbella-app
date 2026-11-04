'use client'

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

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
}: {
  enabled: boolean
  resetKey: string
  children: ReactNode
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const [viewportHeight, setViewportHeight] = useState<number | null>(null)

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

  if (!enabled) return <>{children}</>

  return (
    <div ref={hostRef} className="carta-whole-row-host flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      <div
        ref={viewportRef}
        className="carta-whole-row-scroll w-full overflow-y-auto overscroll-contain custom-scrollbar"
        style={{ height: viewportHeight == null ? '100%' : String(viewportHeight) + 'px', maxHeight: '100%' }}
        tabIndex={0}
        role="region"
        aria-label="Productos de la sección"
      >
        <div ref={listRef}>{children}</div>
      </div>
    </div>
  )
}
