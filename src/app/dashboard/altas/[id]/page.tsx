import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { isMasterDashboardUser } from '@/lib/master-dashboard';
import { getEmploymentIntake, listProfilesForIntakeLink } from '@/app/actions/employment-intakes';
import { AltaDetailClient } from '@/components/alta/AltaDetailClient';

export const dynamic = 'force-dynamic';

export default async function AltaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email || !isMasterDashboardUser(user.email)) {
    redirect('/dashboard');
  }

  const { id } = await params;
  const [loaded, profiles] = await Promise.all([getEmploymentIntake(id), listProfilesForIntakeLink()]);
  if (!loaded.success) notFound();
  if (!profiles.success) notFound();

  return <AltaDetailClient intake={loaded.intake} profiles={profiles.profiles} />;
}
