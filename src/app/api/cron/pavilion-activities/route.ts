import { NextRequest, NextResponse } from 'next/server';
import {
  getPavilionAdminClient,
  recoverPavilionActivityBatch,
} from '@/lib/pavilion-activities/recovery';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Revisión diaria de pendientes, errores y procesos interrumpidos.
 * Solo Vercel con CRON_SECRET; nunca exponer como endpoint público.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const result = await recoverPavilionActivityBatch(getPavilionAdminClient());
    console.log('[cron/pavilion-activities] Resultado', result);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('[cron/pavilion-activities]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error revisando actividades.' },
      { status: 500 },
    );
  }
}
