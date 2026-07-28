'use client'

import { AppShell } from '../app-shell'
import { PageContainer } from '../page/page-container'
import type {
  AppShellVariant,
  BreadcrumbItem,
  NavigationGroup,
  UserSummary,
} from '../sidebar/navigation'
import { MDSProvider, type MDSThemeMode } from './mds-provider'
import { NavigationProvider } from './navigation-provider'

type ShellProviderProps = {
  children: React.ReactNode
  variant?: AppShellVariant
  navigation: NavigationGroup[]
  user?: UserSummary
  breadcrumbs?: BreadcrumbItem[]
  theme?: MDSThemeMode
  /** Si false, no envuelve en PageContainer (páginas con layout propio). */
  withPageContainer?: boolean
  className?: string
}

/**
 * Compone MDS + Navigation + AppShell para una pantalla V2.
 */
export function ShellProvider({
  children,
  variant = 'manager',
  navigation,
  user,
  breadcrumbs,
  theme = 'light',
  withPageContainer = true,
  className,
}: ShellProviderProps) {
  return (
    <MDSProvider theme={theme}>
      <NavigationProvider navigation={navigation}>
        <AppShell
          variant={variant}
          navigation={navigation}
          user={user}
          breadcrumbs={breadcrumbs}
          className={className}
        >
          {withPageContainer ? (
            <PageContainer>{children}</PageContainer>
          ) : (
            children
          )}
        </AppShell>
      </NavigationProvider>
    </MDSProvider>
  )
}
