'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import {
  Button,
  DateField,
  Toolbar,
  ToolbarActions,
  ToolbarFilters,
} from '@/components/mds'
import type { WebAnalyticsDashboardFilters } from '@/lib/web-analytics/types'

type WebAnalyticsFiltersProps = {
  filters: WebAnalyticsDashboardFilters
}

export function WebAnalyticsFilters({ filters }: WebAnalyticsFiltersProps) {
  const router = useRouter()
  const [day, setDay] = useState(filters.day ?? '')

  useEffect(() => {
    setDay(filters.day ?? '')
  }, [filters.day])

  function applyFilters(nextDay: string) {
    const params = new URLSearchParams()
    if (nextDay) params.set('dia', nextDay)
    const query = params.toString()
    router.push(query ? `/dashboard/web?${query}` : '/dashboard/web')
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    applyFilters(day)
  }

  return (
    <form onSubmit={handleSubmit}>
      <Toolbar className="gap-2">
        <ToolbarFilters>
          <div className="w-[9.5rem] shrink-0">
            <DateField
              id="web-analytics-day"
              name="dia"
              aria-label="Día"
              value={day}
              onChange={(event) => setDay(event.target.value)}
            />
          </div>
        </ToolbarFilters>
        <ToolbarActions className="ml-0">
          <Button type="submit" variant="primary" className="px-4 text-xs">
            OK
          </Button>
          <Button
            type="button"
            variant="outline"
            className="px-3"
            aria-label="Limpiar filtros"
            onClick={() => {
              setDay('')
              router.push('/dashboard/web')
            }}
          >
            <X className="size-4" aria-hidden />
          </Button>
        </ToolbarActions>
      </Toolbar>
    </form>
  )
}
