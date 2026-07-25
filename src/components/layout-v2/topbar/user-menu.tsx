'use client'

import { UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { UserSummary } from '../sidebar/navigation'

type UserMenuProps = {
  user?: UserSummary
  className?: string
}

/** Placeholder — no menu behavior in Sprint 3. */
export function UserMenu({ user, className }: UserMenuProps) {
  const label = user?.name ?? 'Usuario'

  return (
    <Button
      type="button"
      variant="outline"
      className={cn(
        'min-h-12 max-w-[12rem] gap-2 border-mds-border bg-mds-surface px-3 text-mds-foreground',
        className
      )}
      aria-label={`Menú de ${label}`}
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-mds-muted-surface text-mds-muted">
        <UserRound className="size-4" aria-hidden />
      </span>
      <span className="hidden min-w-0 truncate text-sm font-semibold sm:inline">
        {label}
      </span>
    </Button>
  )
}
