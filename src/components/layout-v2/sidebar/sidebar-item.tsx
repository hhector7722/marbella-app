'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import type { NavigationItem } from './navigation'

type SidebarItemProps = {
  item: NavigationItem
  collapsed?: boolean
  onNavigate?: () => void
}

export function SidebarItem({ item, collapsed = false, onNavigate }: SidebarItemProps) {
  const Icon = item.icon
  const content = (
    <>
      {Icon ? (
        <Icon className="size-5 shrink-0" aria-hidden />
      ) : (
        <span className="size-5 shrink-0" aria-hidden />
      )}
      {!collapsed ? (
        <>
          <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>
          {item.badge != null && item.badge !== '' ? (
            <Badge variant="secondary" className="shrink-0">
              {item.badge}
            </Badge>
          ) : null}
          {item.shortcut ? (
            <kbd className="hidden shrink-0 rounded border border-mds-border bg-mds-muted-surface px-1.5 py-0.5 text-[10px] font-semibold text-mds-muted lg:inline">
              {item.shortcut}
            </kbd>
          ) : null}
        </>
      ) : null}
    </>
  )

  const className = cn(
    'flex w-full min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mds-primary/40',
    item.isActive
      ? 'bg-mds-primary text-mds-primary-foreground'
      : 'text-mds-foreground hover:bg-mds-muted-surface',
    item.disabled && 'pointer-events-none opacity-40',
    collapsed && 'justify-center px-0'
  )

  if (item.disabled) {
    return (
      <span className={className} title={item.label} aria-disabled>
        {content}
      </span>
    )
  }

  return (
    <Link
      href={item.href}
      className={className}
      title={collapsed ? item.label : undefined}
      aria-current={item.isActive ? 'page' : undefined}
      onClick={onNavigate}
    >
      {content}
    </Link>
  )
}
