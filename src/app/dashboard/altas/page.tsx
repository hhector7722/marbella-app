import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { isMasterDashboardUser } from '@/lib/master-dashboard';
import { listEmploymentIntakes } from '@/app/actions/employment-intakes';
import { AltasListClient } from '@/components/alta/AltasListClient';
import { PageScreen } from '@/components/dashboard/DashboardDetailLayout';
import { EmptyState } from '@/components/ui/EmptyState';

export const dynamic = 'force-dynamic';

export default async function AltasPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email || !isMasterDashboardUser(user.email)) {
    redirect('/dashboard');
  }

  const listed = await listEmploymentIntakes();
  if (!listed.success) {
    return (
      <PageScreen title="Altas laborales" backHref="/master/dashboard" template="list">
        <EmptyState instance="altas-load-error" variant="error" title="No se han podido cargar" description={listed.error} />
      </PageScreen>
    );
  }

  return <AltasListClient items={listed.items} />;
}
