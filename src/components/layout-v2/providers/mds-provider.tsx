'use client'

import { cn } from '@/lib/utils'

export type MDSThemeMode = 'light' | 'dark' | 'high-contrast'

type MDSProviderProps = {
  children: React.ReactNode
  /** Solo `light` soportado en runtime hoy. dark / high-contrast reservados. */
  theme?: MDSThemeMode
  className?: string
}

/**
 * Provider oficial MDS.
 * Aplica tema semántico en el subárbol (`data-mds-theme` / `data-theme`).
 */
export function MDSProvider({
  children,
  theme = 'light',
  className,
}: MDSProviderProps) {
  const mdsTheme = theme === 'light' ? 'light' : undefined
  const dataTheme =
    theme === 'dark' || theme === 'high-contrast' ? theme : undefined

  return (
    <div
      data-slot="mds-provider"
      data-mds-theme={mdsTheme}
      data-theme={dataTheme}
      className={cn(
        'min-h-screen bg-mds-background text-mds-foreground',
        className
      )}
    >
      {children}
    </div>
  )
}
