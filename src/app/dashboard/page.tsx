import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import DashboardSwitcher from '@/components/dashboards/DashboardSwitcher';
import { withTimeout } from '@/lib/with-timeout';
import { resolveSessionUser } from '@/lib/auth/resolve-session-user';
import { isMasterDashboardUser } from '@/lib/master-dashboard';
import {
  MASTER_VIEW_AS_COOKIE,
  resolveDashboardIdentityFromViewAs,
} from '@/lib/master-view-as';

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

  const email = profile?.email ?? user.email ?? '';
  const role = profile?.role || 'manager';

  let viewAsUserId: string | null = null;
  let viewAsProfile: { role?: string | null; email?: string | null } | null = null;

  if (isMasterDashboardUser(user.email ?? '')) {
    const cookieStore = await cookies();
    viewAsUserId = cookieStore.get(MASTER_VIEW_AS_COOKIE)?.value?.trim() || null;

    if (viewAsUserId && viewAsUserId !== user.id) {
      const viewAsResult = await withTimeout(
        (async () => {
          try {
            return await supabase
              .from('profiles')
              .select('id, role, email')
              .eq('id', viewAsUserId!)
              .maybeSingle();
          } catch {
            return { data: null, error: null };
          }
        })(),
        1500,
        { data: null, error: null },
      );
      viewAsProfile = viewAsResult.data;
    }
  }

  const effective = resolveDashboardIdentityFromViewAs({
    realUserId: user.id,
    realEmail: user.email ?? '',
    realRole: role,
    realProfileEmail: email,
    viewAsUserId,
    viewAsProfile,
  });

  if (effective.role !== 'manager') {
    redirect('/staff/dashboard');
  }

  return (
    <DashboardSwitcher
      userRole={effective.role}
      userEmail={effective.email}
      initialView="admin"
    />
  );
}
