import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BarChart3, Smartphone } from 'lucide-react';
import { UsageDashboard } from '@/components/usage/UsageDashboard';
import { canAccessUsageAnalytics } from '@/lib/usage/access';
import { getUsageDashboardData, parseUsageDashboardFilters } from '@/lib/usage/queries';
import { createClient } from '@/utils/supabase/server';

export const dynamic = 'force-dynamic';

type UsoPageProps = {
  searchParams: Promise<{ dia?: string; usuario?: string; usuarios?: string }>;
};

export default async function UsoPage({ searchParams }: UsoPageProps) {
  const params = await searchParams;
  const filters = parseUsageDashboardFilters(params);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('email')
    .eq('id', user.id)
    .maybeSingle();

  const email = profile?.email ?? user.email ?? '';
  if (!canAccessUsageAnalytics(email)) {
    redirect('/dashboard');
  }

  const data = await getUsageDashboardData(filters);

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 pb-24">
      <div className="flex items-center gap-3 rounded-xl border border-zinc-100 bg-white p-4 shadow-sm">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-zinc-100 bg-zinc-50">
          <BarChart3 className="size-6 text-[#36606F]" aria-hidden />
        </div>
        <h1 className="min-w-0 flex-1 text-lg font-black uppercase tracking-wide text-zinc-800">
          Uso de la app
        </h1>
        <Link
          href="/dashboard/instalacion-app"
          aria-label="Instalación de la app"
          className="flex size-12 shrink-0 items-center justify-center text-[#36606F]"
        >
          <Smartphone className="size-6" strokeWidth={1.5} aria-hidden />
        </Link>
      </div>
      <UsageDashboard data={data} />
    </div>
  );
}
