'use client'

import { useEffect, useMemo } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

type MarbellaCartaNavigationMessage = {
  type: 'marbella:carta:navigation'
  pathname: string
}

function isInIframe(): boolean {
  try {
    return window.self !== window.top
  } catch {
    // Si el navegador bloquea el acceso a `window.top` por cross-origin,
    // estamos en un iframe (o al menos no somos top-level).
    return true
  }
}

function resolveTargetOrigin(): string {
  // Recomendado: fijar el origin del parent en un env público.
  // Ej: NEXT_PUBLIC_MARBELLA_WEB_ORIGIN="https://marbella-web.vercel.app"
  const explicit = process.env.NEXT_PUBLIC_MARBELLA_WEB_ORIGIN
  if (explicit && /^https?:\/\//.test(explicit)) return explicit

  // Fallback: intentar inferirlo desde el referrer (suele ser la URL del parent).
  try {
    const ref = document.referrer
    if (!ref) return '*'
    return new URL(ref).origin
  } catch {
    return '*'
  }
}

function postCartaNavigation(pathname: string) {
  if (!isInIframe()) return

  const message: MarbellaCartaNavigationMessage = {
    type: 'marbella:carta:navigation',
    pathname,
  }

  const targetOrigin = resolveTargetOrigin()
  window.parent.postMessage(message, targetOrigin)
}

/**
 * Puente de navegación para carta embebida en iframe.
 *
 * Dispara `window.parent.postMessage({ type, pathname })`:
 * - al cargar (mount)
 * - en cada navegación App Router (cambio de pathname / search params)
 * - en cambios de hash (hashchange)
 *
 * Seguridad:
 * - solo envía si está embebida (iframe)
 * - usa targetOrigin si está fijado (o inferido por referrer); fallback "*"
 */
export default function IframeNavBridge() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const navigationKey = useMemo(() => {
    // Re-dispara si cambia el querystring aunque el pathname sea igual.
    // El contrato del mensaje solo exige pathname, pero el parent puede
    // querer reaccionar a “pantallas” con query.
    const qs = searchParams?.toString() ?? ''
    return qs ? `${pathname}?${qs}` : pathname
  }, [pathname, searchParams])

  useEffect(() => {
    postCartaNavigation(pathname)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigationKey])

  useEffect(() => {
    const onHashChange = () => postCartaNavigation(window.location.pathname)
    window.addEventListener('hashchange', onHashChange, { passive: true })
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  return null
}

