import Link from 'next/link';
import { Suspense } from 'react';
import { UsageFilters } from '@/components/usage/UsageFilters';
import { UsageSessionExplorer } from '@/components/usage/UsageSessionExplorer';
import { UsageUserSummary } from '@/components/usage/UsageUserSummary';
import type { UsageDashboardData } from '@/lib/usage/queries';

export function UsageDashboard({ data }: { data: UsageDashboardData }) {
  return (
    <div className="space-y-3">
      <Suspense fallback={<div className="h-12 rounded-xl bg-zinc-100" aria-hidden />}>
        <UsageFilters filters={data.filters} users={data.filterUsers} />
      </Suspense>
      <UsageSessionExplorer
        key={`uso-${data.filters.day ?? 'todos'}-${(data.filters.profileIds ?? []).join(',')}`}
        filters={data.filters}
      />
      <UsageUserSummary summaries={data.summaries} />
      <Link href="/master/dashboard" className="inline-block text-xs font-medium text-[#36606F]">
        Volver al hub master
      </Link>
    </div>
  );
}
