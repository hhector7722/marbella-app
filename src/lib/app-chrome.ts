/** Rutas con layout propio (sin navbar/barra inferior globales). */
export function isFullscreenCartaPath(pathname: string): boolean {
  return (
    pathname === '/carta' ||
    pathname === '/staff/carta' ||
    pathname === '/dashboard/carta'
  );
}

export function shouldShowAppChrome(
  pathname: string,
  isNavigationLoading: boolean,
): boolean {
  if (pathname === '/login') return false;
  if (isNavigationLoading) return true;
  return !isFullscreenCartaPath(pathname);
}
