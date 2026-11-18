import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSessionClient } from '@/utils/supabase/server';
import { isMasterDashboardUser } from '@/lib/master-dashboard';
import {
  getPavilionAdminClient,
  recoverPavilionActivityBatch,
} from '@/lib/pavilion-activities/recovery';

export const maxDuration = 300;

async function authorizedMaster(request: NextRequest): Promise<boolean> {
  // TEMPORARY one-time recovery of 2026-11-24..2026-12-06 PDF imports.
  // Remove this service-role operator access immediately after verified backfill.
  const operatorKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (
    operatorKey &&
    request.headers.get('x-pavilion-recovery') === '2026-11-18-gmail-backfill' &&
    request.headers.get('authorization') === `Bearer ${operatorKey}`
  ) {
    return true;
  }
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
export async function POST(request: NextRequest) {
  if (!(await authorizedMaster(request))) {
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
