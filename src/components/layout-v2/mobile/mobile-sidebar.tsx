'use client'

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useLayout } from '../providers/layout-provider'
import { Sidebar } from '../sidebar/sidebar'
import type { AppShellVariant, NavigationGroup, UserSummary } from '../sidebar/navigation'

type MobileSidebarProps = {
  navigation: NavigationGroup[]
  user?: UserSummary
  variant?: AppShellVariant
}

export function MobileSidebar({
  navigation,
  user,
  variant = 'manager',
}: MobileSidebarProps) {
  const {
    state: { openMobileMenu },
    actions: { setOpenMobileMenu, closeMobile },
  } = useLayout()

  return (
    <Sheet open={openMobileMenu} onOpenChange={setOpenMobileMenu}>
      <SheetContent
        side="left"
        showCloseButton
        className="w-[min(100%,20rem)] border-mds-border bg-mds-surface p-0 pt-safe"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Menú de navegación</SheetTitle>
        </SheetHeader>
        <Sidebar
          navigation={navigation}
          user={user}
          variant={variant}
          className="h-full w-full border-r-0"
          onNavigate={closeMobile}
          forceExpanded
          showCollapseControl={false}
        />
      </SheetContent>
    </Sheet>
  )
}
