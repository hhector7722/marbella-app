/**
 * Tabs raíz con swipe horizontal (solo coincidencia exacta de pathname).
 * Orden visual: Asistencia → Inicio → Perfil (Horarios/Pedidos son modales).
 */
export const STAFF_SWIPEABLE_TAB_ROOTS = [
  '/staff/history',
  '/staff/dashboard',
  '/profile',
] as const;

export type StaffSwipeableTabRoot = (typeof STAFF_SWIPEABLE_TAB_ROOTS)[number];

export function isStaffSwipeableTabRoot(
  pathname: string
): pathname is StaffSwipeableTabRoot {
  return (STAFF_SWIPEABLE_TAB_ROOTS as readonly string[]).includes(pathname);
}

/** Alias semántico del spec. */
export function isExactMainTabRoot(pathname: string): boolean {
  return isStaffSwipeableTabRoot(pathname);
}

export function getStaffTabRootIndex(pathname: string): number {
  return STAFF_SWIPEABLE_TAB_ROOTS.indexOf(pathname as StaffSwipeableTabRoot);
}

export function getAdjacentStaffTabRoot(
  pathname: string,
  direction: 'prev' | 'next'
): StaffSwipeableTabRoot | null {
  const index = getStaffTabRootIndex(pathname);
  if (index < 0) return null;

  const nextIndex = direction === 'next' ? index + 1 : index - 1;
  if (nextIndex < 0 || nextIndex >= STAFF_SWIPEABLE_TAB_ROOTS.length) {
    return null;
  }

  return STAFF_SWIPEABLE_TAB_ROOTS[nextIndex];
}

export function isStaffTabToTabNavigation(
  prevPath: string,
  nextPath: string
): boolean {
  return isStaffSwipeableTabRoot(prevPath) && isStaffSwipeableTabRoot(nextPath);
}
