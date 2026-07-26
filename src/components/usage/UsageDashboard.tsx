import Link from 'next/link'
import { Suspense } from 'react'
import { UsageFilters } from '@/components/usage/UsageFilters'
import { UsageRecentActivity } from '@/components/usage/UsageRecentActivity'
import { UsageUserSummary } from '@/components/usage/UsageUserSummary'
import { Button, LoadingBlock, Section } from '@/components/mds'
import type { UsageDashboardData } from '@/lib/usage/queries'

export function UsageDashboard({ data }: { data: UsageDashboardData }) {
  return (
    <div className="flex flex-col gap-6">
      <Section
        id="usage-filters"
        title="Filtros"
        description="Día y usuarios a incluir en el informe."
      >
        <Suspense fallback={<LoadingBlock lines={1} className="min-h-12" />}>
          <UsageFilters filters={data.filters} users={data.filterUsers} />
        </Suspense>
      </Section>

      <UsageUserSummary summaries={data.summaries} />

      <UsageRecentActivity
        key={`${data.filters.day ?? 'all'}-${serializeFiltersKey(data.filters.profileIds)}`}
        initialEvents={data.recentEvents}
        initialHasMore={data.recentHasMore}
        filters={data.filters}
      />

      <div className="shrink-0">
        <Button variant="ghost" asChild>
          <Link href="/master/dashboard">Volver al hub master</Link>
        </Button>
      </div>
    </div>
  )
}

function serializeFiltersKey(profileIds: string[] | null): string {
  if (profileIds === null) return 'all'
  return profileIds.join(',')
}
