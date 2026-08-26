import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { isMasterDashboardUser } from '@/lib/master-dashboard';
import LaborConditionsView from '@/components/profile/LaborConditionsView';
import { DashboardDetailLayout } from '@/components/dashboard/DashboardDetailLayout';

type SearchParams = Promise<{ id?: string }>;

export default async function ProfileContratoPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email || !isMasterDashboardUser(user.email)) {
    redirect('/profile');
  }

  const params = await searchParams;
  const employeeId = String(params.id ?? '').trim();
  if (!employeeId) {
    redirect('/profile');
  }

  return (
    <DashboardDetailLayout
      title="Condiciones laborales"
      showBackButton
      backHref={`/profile?id=${encodeURIComponent(employeeId)}`}
      template="form"
      maxWidthClass="max-w-2xl"
    >
      <LaborConditionsView employeeId={employeeId} hostedInPageScreen />
    </DashboardDetailLayout>
  );
}
