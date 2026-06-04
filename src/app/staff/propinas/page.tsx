import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import StaffPropinasView from '@/components/tips/StaffPropinasView';
import {
  mapStaffTipHistoryRows,
  STAFF_TIP_HISTORY_SELECT,
  type TipDistributionLineRow,
} from '@/lib/staff-tip-history';

/** Vista propinas (empleado). Manager/admin entran aquí desde staff; gestión en /dashboard/propinas. */
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
    .select('role, first_name')
    .eq('id', user.id)
    .single();

  if (profileError) redirect('/login');

  const role = profile?.role ?? null;

  if (!role || !STAFF_PROPINAS_ROLES.has(role)) {
    redirect('/staff/dashboard');
  }

  const { data: linesRaw, error: linesError } = await supabase
    .from('tip_distribution_lines')
    .select(STAFF_TIP_HISTORY_SELECT)
    .eq('user_id', user.id);

  if (linesError) {
    console.error('[staff/propinas] history:', linesError.message);
  }

  const initialHistory = mapStaffTipHistoryRows(linesRaw as TipDistributionLineRow[] | null);

  return (
    <StaffPropinasView
      initialHistory={initialHistory}
      viewerUserId={user.id}
      viewerEmail={user.email ?? ''}
      viewerFirstName={profile?.first_name ?? ''}
    />
  );
}
