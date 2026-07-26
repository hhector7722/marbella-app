import type { AppShellVariant, NavigationGroup } from '@/components/layout-v2'
import { adminNavigation } from './admin'
import { managerNavigation } from './manager'
import { markActiveNavigation } from './shared'
import { staffNavigation } from './staff'

export type NavigationRole = AppShellVariant | 'admin'

const NAV_BY_ROLE: Record<NavigationRole, NavigationGroup[]> = {
  manager: managerNavigation,
  master: managerNavigation,
  staff: staffNavigation,
  admin: adminNavigation,
}

/**
 * Resuelve la navegación V2 para una variante/rol + pathname activo.
 * El AppShell / Bridge no deben hardcodear rutas.
 */
export function resolveNavigation(
  variant: NavigationRole,
  pathname: string
): NavigationGroup[] {
  const base = NAV_BY_ROLE[variant] ?? managerNavigation
  return markActiveNavigation(base, pathname)
}

export { markActiveNavigation, isNavItemActive } from './shared'
export { managerNavigation } from './manager'
export { staffNavigation } from './staff'
export { adminNavigation } from './admin'
