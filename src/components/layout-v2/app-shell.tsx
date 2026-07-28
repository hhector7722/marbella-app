'use client'

import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import StaffBottomNav from '@/components/StaffBottomNav'
import { isFullscreenCartaPath } from '@/lib/carta-fullscreen-path'
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
  const pathname = usePathname()
  const showBottomNav = !isFullscreenCartaPath(pathname)

  return (
    <LayoutProvider>
      <div
        data-shell-variant={variant}
        className={cn(
          'flex h-dvh max-h-dvh w-full overflow-hidden bg-mds-background text-mds-foreground',
          className
        )}
      >
        <div className="hidden shrink-0 lg:flex">
          <Sidebar navigation={navigation} user={user} variant={variant} />
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <MobileHeader user={user} />
          <Topbar breadcrumbs={breadcrumbs} user={user} />
          <main
            className={cn(
              'flex min-h-0 flex-1 flex-col overflow-y-auto',
              showBottomNav &&
                'pb-[calc(5rem+env(safe-area-inset-bottom,0px))] md:pb-[calc(4rem+env(safe-area-inset-bottom,0px))]'
            )}
          >
            {children}
          </main>
        </div>

        <MobileSidebar
          navigation={navigation}
          user={user}
          variant={variant}
        />

        {showBottomNav ? <StaffBottomNav /> : null}
      </div>
    </LayoutProvider>
  )
}
