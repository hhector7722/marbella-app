/** Rutas que usan la UI a pantalla completa de la carta (sin Navbar ni BottomNav). */
export function isFullscreenCartaPath(pathname: string): boolean {
  if (pathname === '/carta') return true
  if (pathname === '/staff/carta') return true
  if (pathname === '/dashboard/carta') return true
  if (pathname === '/eventos') return true
  if (pathname.startsWith('/eventos/')) return true
  return false
}
