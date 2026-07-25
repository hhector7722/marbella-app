'use client'

import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useLayout } from '../providers/layout-provider'
import { SidebarFooter } from './sidebar-footer'
import { SidebarSection } from './sidebar-section'
import type { AppShellVariant, NavigationGroup, UserSummary } from './navigation'

type SidebarProps = {
  navigation: NavigationGroup[]
  user?: UserSummary
  variant?: AppShellVariant
  className?: string
  onNavigate?: () => void
  /** Force expanded labels (e.g. mobile drawer). */
  forceExpanded?: boolean
  showCollapseControl?: boolean
}

export function Sidebar({
  navigation,
  user,
  variant = 'manager',
  className,
  onNavigate,
  forceExpanded = false,
  showCollapseControl = true,
}: SidebarProps) {
  const {
    state: { sidebarCollapsed },
    actions: { toggleSidebarCollapsed },
  } = useLayout()

  const collapsed = forceExpanded ? false : sidebarCollapsed

  return (
    <aside
      data-variant={variant}
      data-collapsed={collapsed || undefined}
      className={cn(
        'flex h-full flex-col border-r border-mds-border bg-mds-surface',
        collapsed ? 'w-[4.5rem]' : 'w-64',
        className
      )}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-mds-border px-3 py-3">
        {!collapsed ? (
          <p className="truncate px-1 text-sm font-black tracking-tight text-mds-primary">
            Marbella
          </p>
        ) : (
          <span className="sr-only">Marbella</span>
        )}
        {showCollapseControl ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="min-h-12 min-w-12 shrink-0 text-mds-muted hover:text-mds-foreground"
            onClick={toggleSidebarCollapsed}
            aria-label={collapsed ? 'Expandir menú' : 'Colapsar menú'}
          >
            {collapsed ? (
              <PanelLeftOpen className="size-5" />
            ) : (
              <PanelLeftClose className="size-5" />
            )}
          </Button>
        ) : null}
      </div>

      <nav
        className="flex-1 overflow-y-auto px-2 py-3"
        aria-label="Navegación principal"
      >
        <div className="flex flex-col gap-4">
          {navigation.map((group) => (
            <div key={group.id} className="flex flex-col gap-1">
              {group.label && !collapsed ? (
                <p className="px-3 text-[10px] font-black uppercase tracking-widest text-mds-muted">
                  {group.label}
                </p>
              ) : null}
              {group.sections.map((section) => (
                <SidebarSection
                  key={section.id}
                  section={section}
                  collapsed={collapsed}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          ))}
        </div>
      </nav>

      <SidebarFooter user={user} collapsed={collapsed} />
    </aside>
  )
}
