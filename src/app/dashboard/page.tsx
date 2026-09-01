import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import DashboardSwitcher from '@/components/dashboards/DashboardSwitcher';
import { withTimeout } from '@/lib/with-timeout';
import { resolveSessionUser } from '@/lib/auth/resolve-session-user';

/**
 * Admin dashboard: shell inmediata. AdminDashboardView carga tesorería/ventas
 * en cliente; overtime en paralelo (sección con spinner, no bloquea el resto).
 */
export default async function AdminDashboardPage() {
  const supabase = await createClient();
  const user = await resolveSessionUser(supabase);

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
