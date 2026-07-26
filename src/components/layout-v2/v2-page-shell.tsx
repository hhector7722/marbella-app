'use client'

import { usePathname } from 'next/navigation'
import { resolveNavigation } from '@/config/navigation'
import type {
  AppShellVariant,
  BreadcrumbItem,
  UserSummary,
} from './sidebar/navigation'
import {
  ShellProvider,
} from './providers/shell-provider'
import type { MDSThemeMode } from './providers/mds-provider'

type V2PageShellProps = {
  children: React.ReactNode
  /** Variante de shell; la nav se resuelve del registry (sin rutas hardcodeadas aquí). */
  variant?: AppShellVariant
  user?: UserSummary
  breadcrumbs?: BreadcrumbItem[]
  theme?: MDSThemeMode
  withPageContainer?: boolean
  className?: string
}

/**
 * Helper de migración V2.
 *
 * Uso típico en una page Server Component:
 * ```tsx
 * <V2PageShell variant="manager" user={…} breadcrumbs={…}>
 *   <MyMigratedClient />
 * </V2PageShell>
 * ```
 *
 * 1. Registrar la ruta en `src/config/v2/registry.ts`
 * 2. Asegurar el item en `src/config/navigation/{variant}.ts`
 * 3. Sustituir UI legacy por MDS
 * 4. Envolver con este helper — lógica intacta
 */
export function V2PageShell({
  children,
  variant = 'manager',
  user,
  breadcrumbs,
  theme = 'light',
  withPageContainer = true,
  className,
}: V2PageShellProps) {
  const pathname = usePathname()
  const navigation = resolveNavigation(variant, pathname)

  return (
    <ShellProvider
      variant={variant}
      navigation={navigation}
      user={user}
      breadcrumbs={breadcrumbs}
      theme={theme}
      withPageContainer={withPageContainer}
      className={className}
    >
      {children}
    </ShellProvider>
  )
}

/** @deprecated Usar `V2PageShell`. Alias de compatibilidad Sprint 7→8. */
export const V2AppShellBridge = V2PageShell
