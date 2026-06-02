export type MarbellaCartaNavigationMessage = {
  type: 'marbella:carta:navigation'
  pathname: string
  isCategoriesRoot: boolean
}

/** Ruta de la rejilla principal de categorías (la URL no cambia al abrir modales). */
export function isCartaCategoriesRoute(pathname: string): boolean {
  const normalized = pathname.replace(/\/+$/, '') || '/'
  return normalized === '/carta'
}

function isInIframe(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.self !== window.top
  } catch {
    return true
  }
}

function resolveTargetOrigin(): string {
  const explicit = process.env.NEXT_PUBLIC_MARBELLA_WEB_ORIGIN
  if (explicit && /^https?:\/\//.test(explicit)) return explicit

  try {
    const ref = document.referrer
    if (!ref) return '*'
    return new URL(ref).origin
  } catch {
    return '*'
  }
}

export function postCartaNavigation(pathname: string, isCategoriesRoot: boolean) {
  if (typeof window === 'undefined' || !isInIframe()) return

  const message: MarbellaCartaNavigationMessage = {
    type: 'marbella:carta:navigation',
    pathname,
    isCategoriesRoot,
  }

  window.parent.postMessage(message, resolveTargetOrigin())
}
