'use client'

import { useState } from 'react'
import { firstNameOnly } from '@/lib/usage/display-name'
import {
  serializeProfileIdsForUrl,
  USAGE_RECENT_PAGE_SIZE,
} from '@/lib/usage/filters'
import type {
  UsageDashboardFilters,
  UsageRecentEvent,
} from '@/lib/usage/queries'
import {
  Button,
  EmptyState,
  List,
  ListHeader,
  ListItem,
  Section,
  Surface,
  Text,
} from '@/components/mds'

type UsageRecentActivityProps = {
  initialEvents: UsageRecentEvent[]
  initialHasMore: boolean
  filters: UsageDashboardFilters
}

function buildRecentQuery(filters: UsageDashboardFilters, offset: number): string {
  const params = new URLSearchParams()
  if (filters.day) params.set('dia', filters.day)
  const usuarios = serializeProfileIdsForUrl(filters.profileIds)
  if (usuarios !== null) params.set('usuarios', usuarios)
  params.set('offset', String(offset))
  params.set('limit', String(USAGE_RECENT_PAGE_SIZE))
  return params.toString()
}

export function UsageRecentActivity({
  initialEvents,
  initialHasMore,
  filters,
}: UsageRecentActivityProps) {
  const [events, setEvents] = useState(initialEvents)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [loading, setLoading] = useState(false)

  async function loadMore() {
    if (loading || !hasMore) return
    setLoading(true)
    try {
      const query = buildRecentQuery(filters, events.length)
      const response = await fetch(`/api/usage/recent?${query}`)
      if (!response.ok) throw new Error('No se pudo cargar más actividad')
      const data = (await response.json()) as {
        events: UsageRecentEvent[]
        hasMore: boolean
      }
      setEvents((prev) => [...prev, ...data.events])
      setHasMore(data.hasMore)
    } catch {
      setHasMore(false)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Section
      id="usage-recent"
      title="Actividad reciente"
      description="Eventos de uso ordenados por tiempo."
    >
      <Surface variant="default" className="overflow-hidden p-0">
        {events.length === 0 ? (
          <EmptyState
            variant="compact"
            title="Sin eventos"
            description="No hay actividad reciente con estos filtros."
            className="border-0 shadow-none"
          />
        ) : (
          <List className="rounded-none border-0 shadow-none">
            {events.flatMap((event, index) => {
              const prev = index > 0 ? events[index - 1] : null
              const showUserHeader = !prev || prev.profileId !== event.profileId
              const nodes: React.ReactNode[] = []

              if (showUserHeader) {
                nodes.push(
                  <ListHeader
                    key={`user-${event.profileId}-${index}`}
                    className="bg-mds-muted-surface/60"
                  >
                    {firstNameOnly(event.displayName)}
                  </ListHeader>
                )
              }

              nodes.push(
                <ListItem key={event.id} className="min-h-10 gap-2 py-2 text-xs">
                  <Text
                    as="p"
                    variant="body"
                    className="min-w-0 flex-1 truncate font-medium"
                  >
                    {event.title}
                  </Text>
                  <Text
                    as="span"
                    variant="body"
                    muted
                    className="w-28 shrink-0 text-right text-xs tabular-nums"
                  >
                    {event.timeLabel}
                  </Text>
                </ListItem>
              )

              return nodes
            })}
          </List>
        )}

        {hasMore ? (
          <div className="border-t border-mds-border p-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => void loadMore()}
              loading={loading}
              className="w-full"
            >
              {loading ? 'Cargando…' : 'Ver más'}
            </Button>
          </div>
        ) : null}
      </Surface>
    </Section>
  )
}
