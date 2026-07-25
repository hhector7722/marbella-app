import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import DashboardSwitcher from '@/components/dashboards/DashboardSwitcher';
import { withTimeout } from '@/lib/with-timeout';

/**
 * Admin dashboard: shell inmediata. AdminDashboardView ya hace
 * getDashboardData() en cliente si no hay initialData (evita SSR de 60d HE).
 */
export default async function AdminDashboardPage() {
  const supabase = await createClient();

  const sessionResult = await withTimeout(
    supabase.auth.getSession(),
    1500,
    { data: { session: null }, error: null },
  );
  const user = sessionResult.data.session?.user ?? null;

  if (!user) {
    redirect('/login');
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
    1500,
    { data: null, error: null },
  );

  const profile = profileResult.data;

  if (profile && profile.role !== 'manager') {
    redirect('/staff/dashboard');
  }

  // Sin perfil a tiempo: no bloqueamos con getDashboardData; el cliente carga.
  // Si no es manager, el proxy ya filtró la mayoría de casos.
  const email = profile?.email ?? user.email ?? '';
  const role = profile?.role || 'manager';

  return (
    <DashboardSwitcher
      userRole={role}
      userEmail={email}
      initialView="admin"
    />
  );
}
