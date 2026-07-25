import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import DashboardSwitcher from '@/components/dashboards/DashboardSwitcher';
import { getDashboardData } from '@/app/actions/get-dashboard-data';
import { isMasterDashboardUser } from '@/lib/master-dashboard';
import { withTimeout } from '@/lib/with-timeout';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

async function MasterDashboardContent() {
  const supabase = await createClient();

  // getSession (cookies) — no getUser() a GoTrue (colgaba el HTML).
  const sessionResult = await withTimeout(
    supabase.auth.getSession(),
    2000,
    { data: { session: null }, error: null },
  );
  const user = sessionResult.data.session?.user ?? null;

  if (!user) {
    redirect('/login');
  }

  const emailFromJwt = user.email ?? '';
  if (!isMasterDashboardUser(emailFromJwt)) {
    redirect('/dashboard');
  }

  const profileResult = await withTimeout(
    (async () => {
      try {
        return await supabase
          .from('profiles')
          .select('role, email')
          .eq('id', user.id)
          .maybeSingle();
      } catch {
        return { data: null, error: null };
      }
    })(),
    2000,
    { data: null, error: null },
  );

  const profile = profileResult.data;
  const email = profile?.email ?? emailFromJwt;

  if (profile?.role !== 'manager') {
    redirect('/staff/dashboard');
  }

  const dashboardData = await getDashboardData();

  return (
    <DashboardSwitcher
      userRole={profile?.role || 'staff'}
      userEmail={email}
      initialView="master"
      initialData={dashboardData}
    />
  );
}

export default function MasterDashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50dvh] items-center justify-center">
          <LoadingSpinner size="xl" className="text-[#5B8FB9]" />
        </div>
      }
    >
      <MasterDashboardContent />
    </Suspense>
  );
}
