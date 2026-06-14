import { NextRequest, NextResponse } from 'next/server';
import {
  createPavilionActivitiesServiceClient,
  syncPavilionActivitiesFromGmail,
} from '@/lib/gmail/pavilion-activities-sync';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

/** Sincroniza PDFs de actividades del pabellón desde Gmail (fmarco@cemmarbella.cat). */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    console.warn('[CRON_PAVILION_ACTIVITIES] Petición no autorizada');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createPavilionActivitiesServiceClient();
    const result = await syncPavilionActivitiesFromGmail(supabase);

    console.log(
      `[CRON_PAVILION_ACTIVITIES] OK processed=${result.processed} imported=${result.imported} skipped=${result.skipped}`,
    );

    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno';
    console.error('[CRON_PAVILION_ACTIVITIES]', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
