'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { firstNameOnly } from '@/lib/usage/display-name'
import type { UsageUserSummary as UsageUserSummaryType } from '@/lib/usage/queries'
import {
  EmptyState,
  List,
  ListItem,
  Surface,
  Text,
} from '@/components/mds'

function formatDateTimeMadrid(iso: string | null): string {
  if (!iso) return ' '
  return new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(iso))
}

function displayCount(value: number): string | number {
  return value === 0 ? ' ' : value
}

type UsageUserSummaryProps = {
  summaries: UsageUserSummaryType[]
}

export function UsageUserSummary({ summaries }: UsageUserSummaryProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <Surface variant="default" className="overflow-hidden p-0">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex min-h-12 w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-mds-muted-surface/60"
        aria-expanded={expanded}
      >
        <Text as="span" variant="label">
          Resumen por usuario
          {summaries.length > 0 ? (
            <span className="ml-2 font-semibold normal-case tracking-normal text-mds-muted">
              ({summaries.length})
            </span>
          ) : null}
        </Text>
        <ChevronDown
          className={cn(
            'size-5 shrink-0 text-mds-primary transition-transform',
            expanded && 'rotate-180'
          )}
          aria-hidden
        />
      </button>

      {expanded ? (
        <div className="border-t border-mds-border">
          {summaries.length === 0 ? (
            <EmptyState
              variant="compact"
              title="Sin datos"
              description="Todavía no hay resumen por usuario."
              className="border-0 shadow-none"
            />
          ) : (
            <List className="rounded-none border-0 shadow-none">
              {summaries.map((user) => (
                <ListItem key={user.profileId} className="gap-2 text-xs">
                  <Text
                    as="p"
                    variant="body"
                    className="min-w-0 flex-1 truncate font-semibold"
                  >
                    {firstNameOnly(user.displayName)}
                  </Text>
                  <Text as="span" variant="body" muted className="shrink-0 text-xs">
                    {displayCount(user.pageViewCount)} pag
                  </Text>
                  <Text as="span" variant="body" muted className="shrink-0 text-xs">
                    {displayCount(user.actionCount)} acc
                  </Text>
                  <Text
                    as="span"
                    variant="body"
                    muted
                    className="shrink-0 text-xs tabular-nums"
                  >
                    {formatDateTimeMadrid(user.lastSeenAt)}
                  </Text>
                </ListItem>
              ))}
            </List>
          )}
        </div>
      ) : null}
    </Surface>
  )
}
