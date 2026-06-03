import { redirect } from 'next/navigation';
import { format, startOfMonth } from 'date-fns';
import { createClient } from '@/utils/supabase/server';
import TipsDashboardView from '@/components/tips/TipsDashboardView';
import { addLocalDaysIso, type TipDistributionHistoryRow } from '@/lib/tip-distribution-display';

export default async function PropinasPage() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? null;

  if (!user) redirect('/login');

  const { data: profile, error } = await supabase.from('profiles').select('role').eq('id', user.id).single();

  if (error) {
    redirect('/login');
  }

  const role = profile?.role ?? null;
  const isManagerOrAdmin = role === 'manager' || role === 'admin';

  const { data: poolEditorRow, error: poolEditorError } = await supabase
    .from('tip_pool_editors')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (poolEditorError) {
    redirect('/login');
  }

  const canEditPools = isManagerOrAdmin || !!poolEditorRow;
  if (!canEditPools) redirect('/staff/dashboard');

  const canEditOverrides = isManagerOrAdmin;
  const canConfirmDistribution = isManagerOrAdmin;

  const today = format(new Date(), 'yyyy-MM-dd');
  let initialStartDate = format(startOfMonth(new Date()), 'yyyy-MM-dd');
  const initialEndDate = today;

  const { data: lastDistributionRaw, error: lastDistError } = await supabase
    .from('tip_distribution_history')
    .select('id, period_start, period_end, weekday_total, weekend_total, confirmed_at, notes')
    .order('confirmed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastDistError) {
    console.error('[propinas] last distribution:', lastDistError.message);
  }

  const lastDistribution = (lastDistributionRaw ?? null) as TipDistributionHistoryRow | null;

  if (lastDistribution?.period_end) {
    initialStartDate = addLocalDaysIso(lastDistribution.period_end, 1);
  }

  return (
    <TipsDashboardView
      canEditPools={canEditPools}
      canEditOverrides={canEditOverrides}
      canConfirmDistribution={canConfirmDistribution}
      initialStartDate={initialStartDate}
      initialEndDate={initialEndDate}
      lastDistribution={lastDistribution}
    />
  );
}
