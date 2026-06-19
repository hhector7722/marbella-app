import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Globe } from 'lucide-react';
import { WebAnalyticsDashboard } from '@/components/web-analytics/WebAnalyticsDashboard';
import { canAccessWebAnalytics } from '@/lib/web-analytics/access';
import { getWebAnalyticsDashboardData, parseWebAnalyticsFilters } from '@/lib/web-analytics/queries';
import { createClient } from '@/utils/supabase/server';

export const dynamic = 'force-dynamic';

type WebAnalyticsPageProps = {
  searchParams: Promise<{ dia?: string }>;
};

export default async function WebAnalyticsPage({ searchParams }: WebAnalyticsPageProps) {
  const params = await searchParams;
  const filters = parseWebAnalyticsFilters(params);

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
  if (!canAccessWebAnalytics(email)) {
    redirect('/dashboard');
  }

  const data = await getWebAnalyticsDashboardData(filters);

  return (
    <div className="mx-auto min-h-screen max-w-3xl space-y-4 p-4">
      <div className="flex items-center gap-3 rounded-xl border border-zinc-100 bg-white p-4 shadow-sm">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-zinc-100 bg-zinc-50">
          <Globe className="size-6 text-[#36606F]" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-black uppercase tracking-wide text-zinc-800">
            Analítica web
          </h1>
          <p className="truncate text-xs text-zinc-500">Visitas, navegación y clics en marbella-web</p>
        </div>
        <Link
          href="https://marbella-web.vercel.app"
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-xs font-semibold text-[#36606F]"
        >
          Abrir web
        </Link>
      </div>
      <WebAnalyticsDashboard data={data} />
    </div>
  );
}
