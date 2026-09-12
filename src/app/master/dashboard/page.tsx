import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import DashboardSwitcher from '@/components/dashboards/DashboardSwitcher';
import { isMasterDashboardUser } from '@/lib/master-dashboard';
import { resolveSessionUser } from '@/lib/auth/resolve-session-user';

/**
 * Home master: NO await de tesorería/ventas/HE.
 * Tesorería de C Inicial y Cajas Cambio: useHomeTreasury en cliente (snapshot compartido).
 */
export default async function MasterDashboardPage() {
  const supabase = await createClient();
  const user = await resolveSessionUser(supabase);

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
      userId={user.id}
      userRole="manager"
      userEmail={email}
      initialView="master"
    />
  );
}
