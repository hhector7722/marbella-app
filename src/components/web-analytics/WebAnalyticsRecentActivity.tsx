'use client'

import { useState } from 'react'
import {
  WEB_ANALYTICS_RECENT_PAGE_SIZE,
  type WebAnalyticsDashboardFilters,
  type WebAnalyticsRecentEvent,
} from '@/lib/web-analytics/types'
import {
  Button,
  EmptyState,
  List,
  ListItem,
  Section,
  Surface,
  Text,
} from '@/components/mds'

type WebAnalyticsRecentActivityProps = {
  initialEvents: WebAnalyticsRecentEvent[]
  initialHasMore: boolean
  filters: WebAnalyticsDashboardFilters
}

function buildRecentQuery(
  filters: WebAnalyticsDashboardFilters,
  offset: number
): string {
  const params = new URLSearchParams()
  if (filters.day) params.set('dia', filters.day)
  params.set('offset', String(offset))
  params.set('limit', String(WEB_ANALYTICS_RECENT_PAGE_SIZE))
  return params.toString()
}

export function WebAnalyticsRecentActivity({
  initialEvents,
  initialHasMore,
  filters,
}: WebAnalyticsRecentActivityProps) {
  const [events, setEvents] = useState(initialEvents)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [loading, setLoading] = useState(false)

  async function loadMore() {
    if (loading || !hasMore) return
    setLoading(true)
    try {
      const query = buildRecentQuery(filters, events.length)
      const response = await fetch(`/api/web-analytics/recent?${query}`)
      if (!response.ok) throw new Error('No se pudo cargar más actividad')
      const data = (await response.json()) as {
        events: WebAnalyticsRecentEvent[]
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
      id="web-recent"
      title="Actividad reciente"
      description="Eventos de marbella-web ordenados por tiempo."
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
            {events.map((event) => (
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
            ))}
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
