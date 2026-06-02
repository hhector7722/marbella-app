'use client'

import { useEffect, useMemo } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

import { isCartaCategoriesRoute, postCartaNavigation } from '@/lib/carta-iframe-bridge'

/**
 * Puente de navegación para carta embebida en iframe.
 *
 * En `/carta` la URL no cambia al abrir categorías (modales internos): ahí
 * reporta el estado `MenuAccordion` vía `isCategoriesRoot`.
 * Este bridge solo fuerza `isCategoriesRoot: false` al salir de `/carta`.
 */
export default function IframeNavBridge() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const navigationKey = useMemo(() => {
    const qs = searchParams?.toString() ?? ''
    return qs ? `${pathname}?${qs}` : pathname
  }, [pathname, searchParams])

  useEffect(() => {
    if (isCartaCategoriesRoute(pathname)) return
    postCartaNavigation(pathname, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigationKey])

  useEffect(() => {
    const onHashChange = () => {
      if (isCartaCategoriesRoute(window.location.pathname)) return
      postCartaNavigation(window.location.pathname, false)
    }
    window.addEventListener('hashchange', onHashChange, { passive: true })
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  return null
}
