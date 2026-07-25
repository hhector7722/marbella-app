'use client'

import { Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useLayout } from '../providers/layout-provider'
import { SearchButton } from '../topbar/search-button'
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
        'flex shrink-0 items-center gap-2 border-b border-mds-border bg-mds-surface px-3 py-2 lg:hidden',
        className
      )}
    >
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
      <div className="flex shrink-0 items-center gap-1">
        <SearchButton className="px-2 sm:px-3" />
        <UserMenu user={user} className="max-w-[9rem]" />
      </div>
    </header>
  )
}
