/** Rutas que usan la UI a pantalla completa de la carta (sin Navbar ni BottomNav). */
export function isFullscreenCartaPath(pathname: string): boolean {
  if (pathname === '/carta') return true
  if (pathname === '/staff/carta') return true
  if (pathname === '/dashboard/carta') return true
  if (pathname === '/eventos') return true
  if (pathname.startsWith('/eventos/')) return true
  return false
}

/** Rutas con scroll en contenedor interno (no en `window`). Pull-to-refresh rompe el deslizamiento táctil. */
export function isInternalScrollShellPath(pathname: string): boolean {
  if (isFullscreenCartaPath(pathname)) return true
  if (pathname === '/orders/new' || pathname.startsWith('/orders/')) return true
  if (pathname === '/suppliers' || pathname.startsWith('/suppliers/')) return true
  if (pathname === '/dashboard/propinas') return true
  return false
}

/** Páginas con barra inferior propia: el `main` no añade padding inferior extra. */
export function isAppShellScrollPage(pathname: string): boolean {
  if (isFullscreenCartaPath(pathname)) return false
  return isInternalScrollShellPath(pathname)
}
