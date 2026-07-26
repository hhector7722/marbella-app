import type { AppShellVariant } from '@/components/layout-v2'

/**
 * Registro central de rutas que montan AppShell V2.
 * Opt-in por path. Ampliar aquí al migrar pantallas nuevas.
 *
 * No usar route groups todavía.
 */
export const V2_ROUTE_REGISTRY = {
  manager: [
    '/dashboard/instalacion-app',
    '/dashboard/uso',
    '/dashboard/web',
    '/dashboard/insights',
    '/dashboard/scanner',
    '/dashboard/inventory/waste',
    '/dashboard/inventory/ledger',
  ],
  master: [] as string[],
  staff: [] as string[],
  admin: [] as string[],
} as const satisfies Record<AppShellVariant | 'admin', readonly string[]>

export type V2RouteVariant = keyof typeof V2_ROUTE_REGISTRY

/** Todas las rutas V2 (planas), para chrome legacy / helpers. */
export function getAllV2Paths(): readonly string[] {
  return Object.values(V2_ROUTE_REGISTRY).flat()
}

/** ¿pathname pertenece al registro V2? */
export function isRegisteredV2Path(pathname: string): boolean {
  return getAllV2Paths().some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  )
}

/** Variante de registro asociada a un path (primera coincidencia). */
export function getV2VariantForPath(
  pathname: string
): V2RouteVariant | null {
  for (const [variant, paths] of Object.entries(V2_ROUTE_REGISTRY) as [
    V2RouteVariant,
    readonly string[],
  ][]) {
    if (
      paths.some(
        (path) => pathname === path || pathname.startsWith(`${path}/`)
      )
    ) {
      return variant
    }
  }
  return null
}
