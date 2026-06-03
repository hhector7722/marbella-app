import { redirect } from 'next/navigation';
import { format, startOfMonth } from 'date-fns';
import { createClient } from '@/utils/supabase/server';
import StaffPropinasView, {
  type StaffTipHistoryEntry,
} from '@/components/tips/StaffPropinasView';
import { addLocalDaysIso } from '@/lib/tip-distribution-display';

/** Vista «Mis propinas» (empleado). Manager/admin entran aquí desde staff; gestión en /dashboard/propinas. */
const STAFF_PROPINAS_ROLES = new Set(['staff', 'supervisor', 'chef', 'manager', 'admin']);

export default async function StaffPropinasPage() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user ?? null;

  if (!user) redirect('/login');

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError) redirect('/login');

  const role = profile?.role ?? null;

  if (!role || !STAFF_PROPINAS_ROLES.has(role)) {
    redirect('/staff/dashboard');
  }

  const today = format(new Date(), 'yyyy-MM-dd');
  let initialStartDate = format(startOfMonth(new Date()), 'yyyy-MM-dd');
  const initialEndDate = today;

  const { data: lastDistribution, error: lastDistError } = await supabase
    .from('tip_distribution_history')
    .select('period_end')
    .order('confirmed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastDistError) {
    console.error('[staff/propinas] last distribution:', lastDistError.message);
  }

  if (lastDistribution?.period_end) {
    initialStartDate = addLocalDaysIso(lastDistribution.period_end, 1);
  }

  const { data: linesRaw, error: linesError } = await supabase
    .from('tip_distribution_lines')
    .select(
      `
      id,
      total_amount,
      weekday_amount,
      weekend_amount,
      tji_pct,
      penalizacion_pct,
      tip_distribution_history (
        period_start,
        period_end,
        confirmed_at
      )
    `
    )
    .eq('user_id', user.id);

  if (linesError) {
    console.error('[staff/propinas] history:', linesError.message);
  }

  type HistoryJoin = {
    period_start: string;
    period_end: string;
    confirmed_at: string;
  };

  function pickHistoryJoin(
    joined: HistoryJoin | HistoryJoin[] | null | undefined
  ): HistoryJoin | null {
    if (!joined) return null;
    if (Array.isArray(joined)) return joined[0] ?? null;
    return joined;
  }

  const initialHistory: StaffTipHistoryEntry[] = (linesRaw ?? [])
    .map((row) => {
      const h = pickHistoryJoin(
        row.tip_distribution_history as HistoryJoin | HistoryJoin[] | null
      );
      if (!h) return null;
      return {
        lineId: row.id as string,
        totalAmount: Number(row.total_amount),
        weekdayAmount: Number(row.weekday_amount),
        weekendAmount: Number(row.weekend_amount),
        tjiPct: Number(row.tji_pct),
        penalizacionPct: Number(row.penalizacion_pct),
        periodStart: h.period_start,
        periodEnd: h.period_end,
        confirmedAt: h.confirmed_at,
      };
    })
    .filter((e): e is StaffTipHistoryEntry => e != null)
    .sort(
      (a, b) =>
        new Date(b.confirmedAt).getTime() - new Date(a.confirmedAt).getTime()
    );

  return (
    <StaffPropinasView
      userId={user.id}
      initialStartDate={initialStartDate}
      initialEndDate={initialEndDate}
      initialHistory={initialHistory}
    />
  );
}
