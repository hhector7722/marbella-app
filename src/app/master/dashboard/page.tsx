import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import DashboardSwitcher from '@/components/dashboards/DashboardSwitcher';
import { isMasterDashboardUser } from '@/lib/master-dashboard';
import { withTimeout } from '@/lib/with-timeout';

/**
 * Home master: NO await de getDashboardData (ventas + plantilla + 60d HE).
 * Eso bloqueaba 5–15s el HTML. MasterDashboardView ya carga tesorería/ventas/OT en cliente.
 */
export default async function MasterDashboardPage() {
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

  const email = user.email ?? '';
  if (!isMasterDashboardUser(email)) {
    redirect('/dashboard');
  }

  // Rol: master home = siempre manager. No consultar profiles aquí —
  // un timeout de profiles redirigía a /staff y empeoraba el arranque.
  return (
    <DashboardSwitcher
      userRole="manager"
      userEmail={email}
      initialView="master"
    />
  );
}
