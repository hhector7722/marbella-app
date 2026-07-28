'use client'

import { Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useLayout } from '../providers/layout-provider'
import { UserMenu } from '../topbar/user-menu'
import type { UserSummary } from '../sidebar/navigation'

type MobileHeaderProps = {
  title?: string
  user?: UserSummary
  className?: string
}

export function MobileHeader({
  title = 'Marbella',
  user,
  className,
}: MobileHeaderProps) {
  const {
    actions: { openMobile },
  } = useLayout()

  return (
    <header
      className={cn(
        'sticky top-0 z-[100] flex shrink-0 flex-col border-b border-mds-border bg-mds-surface pt-safe lg:hidden',
        className
      )}
    >
      <div className="flex h-12 items-center gap-1.5 px-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="min-h-12 min-w-12 shrink-0 text-mds-foreground"
          onClick={openMobile}
          aria-label="Abrir menú"
        >
          <Menu className="size-5" />
        </Button>
        <p className="min-w-0 flex-1 truncate text-sm font-black text-mds-primary">
          {title}
        </p>
        <UserMenu user={user} className="max-w-[9rem] min-h-12 px-2" />
      </div>
    </header>
  )
}
