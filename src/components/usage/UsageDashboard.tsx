import Link from 'next/link';
import { Suspense } from 'react';
import { UsageFilters } from '@/components/usage/UsageFilters';
import { UsageRecentActivity } from '@/components/usage/UsageRecentActivity';
import { UsageUserSummary } from '@/components/usage/UsageUserSummary';
import type { UsageDashboardData } from '@/lib/usage/queries';

export function UsageDashboard({ data }: { data: UsageDashboardData }) {
  return (
    <div className="space-y-4">
      <Suspense
        fallback={
          <div className="h-12 rounded-xl border border-zinc-100 bg-white" aria-hidden />
        }
      >
        <UsageFilters filters={data.filters} users={data.filterUsers} />
      </Suspense>

      <UsageUserSummary summaries={data.summaries} />

      <UsageRecentActivity
        key={`${data.filters.day ?? 'all'}-${serializeFiltersKey(data.filters.profileIds)}`}
        initialEvents={data.recentEvents}
        initialHasMore={data.recentHasMore}
        filters={data.filters}
      />

      <Link href="/master/dashboard" className="inline-block text-xs font-medium text-[#36606F]">
        Volver al hub master
      </Link>
    </div>
  );
}

function serializeFiltersKey(profileIds: string[] | null): string {
  if (profileIds === null) return 'all';
  return profileIds.join(',');
}
