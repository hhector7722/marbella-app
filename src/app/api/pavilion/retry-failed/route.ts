import { NextResponse } from 'next/server';
import { createClient as createSessionClient } from '@/utils/supabase/server';
import { isMasterDashboardUser } from '@/lib/master-dashboard';
import {
  getPavilionAdminClient,
  recoverPavilionActivityBatch,
} from '@/lib/pavilion-activities/recovery';

export const maxDuration = 300;

async function authorizedMaster(): Promise<boolean> {
  const supabase = await createSessionClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return false;

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('email')
    .eq('id', user.id)
    .maybeSingle();

  return !profileError && isMasterDashboardUser(profile?.email ?? user.email ?? '');
}

/** Recuperación manual; nunca modifica un día con ocupaciones ya importadas. */
export async function POST() {
  if (!(await authorizedMaster())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  try {
    const result = await recoverPavilionActivityBatch(getPavilionAdminClient(), {
      forceErrors: true,
    });
    return NextResponse.json({
      success: true,
      queued: result.selected,
      recovered: result.recovered,
      failed: result.failed,
      skipped: result.skipped,
      dates: result.dates,
      message: 'Recuperación verificada. Los días con actividades existentes no se modifican.',
    });
  } catch (error) {
    console.error('[pavilion/retry-failed]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error recuperando PDF.' },
      { status: 500 },
    );
  }
}
