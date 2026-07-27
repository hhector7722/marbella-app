import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  persistOvertimeCostForEmployees,
  recalculateAllBalancesAndPersist,
} from '@/lib/hours-engine/recalculate-and-persist-all';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/** Offset Madrid−UTC en horas (1=CET, 2=CEST), sin RPC. */
function madridUtcOffsetHours(at: Date = new Date()): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Madrid',
    timeZoneName: 'shortOffset',
  });
  const parts = fmt.formatToParts(at);
  const tz = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+1';
  const m = tz.match(/GMT([+-])(\d+)(?::(\d+))?/i);
  if (!m) return 1;
  const sign = m[1] === '-' ? -1 : 1;
  const hours = Number(m[2] || 0);
  const mins = Number(m[3] || 0);
  return sign * (hours + mins / 60);
}

/**
 * Cron: Writer único de proyección (HE+Cost → weekly_snapshots).
 *
 * Auth: Authorization Bearer CRON_SECRET.
 *
 * Query:
 * - slot=winter|summer → guarda DST Madrid (CET=1 / CEST=2)
 * - mode=persist-only → Writer para empleados con snapshots (sin RPC SQL)
 * - mode omitido → mismo Writer global (compat. schedule Vercel)
 */
export async function GET(request: NextRequest) {
  const supabaseUrl =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!supabaseUrl || !supabaseKey) {
    console.error('[CRON_RECALC] Faltan SUPABASE_URL / SERVICE_ROLE_KEY');
    return NextResponse.json(
      { error: 'Configuración incompleta en el servidor' },
      { status: 500 },
    );
  }

  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    console.warn('[CRON_RECALC] Petición no autorizada');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  let slot = request.nextUrl.searchParams.get('slot');
  const mode = request.nextUrl.searchParams.get('mode');

  if (!slot) {
    const hourUtc = new Date().getUTCHours();
    if (hourUtc === 3) slot = 'winter';
    else if (hourUtc === 2) slot = 'summer';
  }

  if (slot === 'winter' || slot === 'summer') {
    const offset = madridUtcOffsetHours();
    if (slot === 'winter' && offset !== 1) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: `slot=winter pero offset Madrid=${offset}`,
      });
    }
    if (slot === 'summer' && offset !== 2) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: `slot=summer pero offset Madrid=${offset}`,
      });
    }
  }

  try {
    if (mode === 'persist-only') {
      console.log('[CRON_RECALC] Writer (persist-only)', { slot });
      const { data: users, error: usersErr } = await supabase
        .from('weekly_snapshots')
        .select('user_id')
        .limit(10000);
      if (usersErr) {
        throw new Error(`Listado empleados: ${usersErr.message}`);
      }
      const userIds = [
        ...new Set((users ?? []).map((r) => r.user_id).filter(Boolean)),
      ] as string[];
      const result = await persistOvertimeCostForEmployees(supabase, userIds);
      console.log('[CRON_RECALC] Writer OK', result);
      return NextResponse.json({ success: true, mode: 'persist-only', ...result });
    }

    console.log('[CRON_RECALC] Writer global', { slot });
    const result = await recalculateAllBalancesAndPersist(supabase);
    console.log('[CRON_RECALC] OK', result);
    return NextResponse.json({
      success: true,
      mode: 'full',
      weeksPersisted: result.weeksPersisted,
      employeeCount: result.employeeCount,
      rpcData: result.rpcData,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[CRON_RECALC_ERROR]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
