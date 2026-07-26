'use client'

import { cn } from '@/lib/utils'
import { LayoutProvider } from './providers/layout-provider'
import { Sidebar } from './sidebar/sidebar'
import { Topbar } from './topbar/topbar'
import { MobileHeader } from './mobile/mobile-header'
import { MobileSidebar } from './mobile/mobile-sidebar'
import type {
  AppShellVariant,
  BreadcrumbItem,
  NavigationGroup,
  UserSummary,
} from './sidebar/navigation'

export type AppShellProps = {
  children: React.ReactNode
  navigation: NavigationGroup[]
  user?: UserSummary
  variant?: AppShellVariant
  breadcrumbs?: BreadcrumbItem[]
  className?: string
}

/**
 * AppShell V2 — presentational chrome only.
 * No Supabase, auth, or fetch.
 * Adopción en rutas: `V2PageShell` + registro `src/config/v2`.
 */
export function AppShell({
  children,
  navigation,
  user,
  variant = 'manager',
  breadcrumbs,
  className,
}: AppShellProps) {
  return (
    <LayoutProvider>
      <div
        data-shell-variant={variant}
        className={cn(
          'flex h-full min-h-screen w-full bg-mds-background text-mds-foreground',
          className
        )}
      >
        <div className="hidden shrink-0 lg:flex">
          <Sidebar navigation={navigation} user={user} variant={variant} />
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <MobileHeader user={user} />
          <Topbar breadcrumbs={breadcrumbs} user={user} />
          <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            {children}
          </main>
        </div>

        <MobileSidebar
          navigation={navigation}
          user={user}
          variant={variant}
        />
      </div>
    </LayoutProvider>
  )
}
