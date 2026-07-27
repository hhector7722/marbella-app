import type { AppShellVariant } from '@/components/layout-v2'

/**
 * Registro central de rutas que montan AppShell V2.
 * Opt-in por path. Ampliar aquí al migrar pantallas nuevas.
 *
 * No usar route groups todavía.
 *
 * Exact-only: `/dashboard` (hub raíz) no debe activar el matching por prefijo
 * sobre hijos no registrados (p. ej. kds). El resto sigue con prefijo `/path/`.
 */
const V2_EXACT_ONLY_PATHS: ReadonlySet<string> = new Set(['/dashboard'])

function pathMatchesRegistered(registered: string, pathname: string): boolean {
  if (pathname === registered) return true
  if (V2_EXACT_ONLY_PATHS.has(registered)) return false
  return pathname.startsWith(`${registered}/`)
}

export const V2_ROUTE_REGISTRY = {
  manager: [
    '/dashboard',
    '/dashboard/instalacion-app',
    '/dashboard/uso',
    '/dashboard/web',
    '/dashboard/insights',
    '/dashboard/scanner',
    '/dashboard/inventory',
    '/dashboard/inventory/waste',
    '/dashboard/inventory/ledger',
    '/dashboard/eventos',
    '/dashboard/albaranes',
    '/dashboard/albaranes-precios',
    '/dashboard/propinas',
    '/dashboard/movements',
    '/dashboard/ledger',
    '/dashboard/import',
    '/dashboard/recetas-import',
    '/dashboard/sala',
    '/dashboard/ventas',
    '/dashboard/consumo-personal',
    '/dashboard/labor',
    '/dashboard/overtime',
    '/dashboard/history',
    '/dashboard/carta',
    '/dashboard/recetas-tpv',
  ],
  master: [] as string[],
  staff: [
    '/staff/propinas',
    '/staff/actividades',
    '/staff/reservas',
    '/staff/dashboard',
    '/staff/carta',
    '/staff/history',
  ],
  admin: [] as string[],
} as const satisfies Record<AppShellVariant | 'admin', readonly string[]>

export type V2RouteVariant = keyof typeof V2_ROUTE_REGISTRY

/** Todas las rutas V2 (planas), para chrome legacy / helpers. */
export function getAllV2Paths(): readonly string[] {
  return Object.values(V2_ROUTE_REGISTRY).flat()
}

/** ¿pathname pertenece al registro V2? */
export function isRegisteredV2Path(pathname: string): boolean {
  return getAllV2Paths().some((path) => pathMatchesRegistered(path, pathname))
}

/** Variante de registro asociada a un path (primera coincidencia). */
export function getV2VariantForPath(
  pathname: string
): V2RouteVariant | null {
  for (const [variant, paths] of Object.entries(V2_ROUTE_REGISTRY) as [
    V2RouteVariant,
    readonly string[],
  ][]) {
    if (paths.some((path) => pathMatchesRegistered(path, pathname))) {
      return variant
    }
  }
  return null
}
