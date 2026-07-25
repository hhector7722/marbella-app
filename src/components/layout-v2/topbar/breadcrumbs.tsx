'use client'

import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { BreadcrumbItem } from '../sidebar/navigation'

type BreadcrumbsProps = {
  items?: BreadcrumbItem[]
  className?: string
}

export function Breadcrumbs({ items = [], className }: BreadcrumbsProps) {
  if (items.length === 0) {
    return <div className={cn('min-h-12 flex-1', className)} />
  }

  return (
    <nav aria-label="Breadcrumb" className={cn('min-w-0 flex-1', className)}>
      <ol className="flex min-h-12 items-center gap-1 overflow-x-auto">
        {items.map((item, index) => {
          const isLast = index === items.length - 1
          return (
            <li key={item.id} className="flex shrink-0 items-center gap-1">
              {index > 0 ? (
                <ChevronRight
                  className="size-4 shrink-0 text-mds-muted"
                  aria-hidden
                />
              ) : null}
              {item.href && !isLast ? (
                <Link
                  href={item.href}
                  className="rounded-lg px-2 py-2 text-sm font-semibold text-mds-muted transition-colors hover:text-mds-foreground"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  className={cn(
                    'rounded-lg px-2 py-2 text-sm font-semibold',
                    isLast ? 'text-mds-foreground' : 'text-mds-muted'
                  )}
                  aria-current={isLast ? 'page' : undefined}
                >
                  {item.label}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
