export { AppShell, type AppShellProps } from './app-shell'

export { LayoutProvider, useLayout } from './providers/layout-provider'
export { MDSProvider, type MDSThemeMode } from './providers/mds-provider'
export {
  NavigationProvider,
  useShellNavigation,
} from './providers/navigation-provider'
export { ShellProvider } from './providers/shell-provider'

export { Sidebar } from './sidebar/sidebar'
export { SidebarItem } from './sidebar/sidebar-item'
export { SidebarSection } from './sidebar/sidebar-section'
export { SidebarFooter } from './sidebar/sidebar-footer'
export type {
  NavigationItem,
  NavigationSection,
  NavigationGroup,
  UserSummary,
  AppShellVariant,
  BreadcrumbItem,
} from './sidebar/navigation'

export { Topbar } from './topbar/topbar'
export { Breadcrumbs } from './topbar/breadcrumbs'
export { SearchButton } from './topbar/search-button'
export { UserMenu } from './topbar/user-menu'

export { MobileHeader } from './mobile/mobile-header'
export { MobileSidebar } from './mobile/mobile-sidebar'

export { PageContainer } from './page/page-container'
export { PageHeader } from './page/page-header'
export { PageActions } from './page/page-actions'

export { V2PageShell, V2AppShellBridge } from './v2-page-shell'
