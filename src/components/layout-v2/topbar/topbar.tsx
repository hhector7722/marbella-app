'use client'

import { cn } from '@/lib/utils'
import { Breadcrumbs } from './breadcrumbs'
import { SearchButton } from './search-button'
import { UserMenu } from './user-menu'
import type { BreadcrumbItem, UserSummary } from '../sidebar/navigation'

type TopbarProps = {
  breadcrumbs?: BreadcrumbItem[]
  user?: UserSummary
  className?: string
}

export function Topbar({ breadcrumbs, user, className }: TopbarProps) {
  return (
    <header
      className={cn(
        'hidden shrink-0 items-center gap-3 border-b border-mds-border bg-mds-surface px-4 py-2 lg:flex',
        className
      )}
    >
      <Breadcrumbs items={breadcrumbs} />
      <div className="flex shrink-0 items-center gap-2">
        <SearchButton />
        <UserMenu user={user} />
      </div>
    </header>
  )
}
