'use client'

import { cn } from '@/lib/utils'
import type { UserSummary } from './navigation'

type SidebarFooterProps = {
  user?: UserSummary
  collapsed?: boolean
  className?: string
}

export function SidebarFooter({ user, collapsed = false, className }: SidebarFooterProps) {
  if (!user) return null

  const initials = user.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')

  return (
    <div
      className={cn(
        'shrink-0 border-t border-mds-border p-3',
        className
      )}
    >
      <div
        className={cn(
          'flex min-h-12 items-center gap-3 rounded-xl bg-mds-muted-surface px-3',
          collapsed && 'justify-center px-0'
        )}
      >
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-mds-primary text-xs font-black text-mds-primary-foreground"
          aria-hidden
        >
          {initials || '?'}
        </span>
        {!collapsed ? (
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-mds-foreground">{user.name}</p>
            {user.roleLabel || user.email ? (
              <p className="truncate text-xs text-mds-muted">
                {user.roleLabel ?? user.email}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
