import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  persistOvertimeCostForEmployees,
  recalculateAllBalancesAndPersist,
} from '@/lib/hours-engine/recalculate-and-persist-all';
import { writeWeeklyProjection } from '@/lib/hours-engine/projection';
import type { CivilDate } from '@/lib/hours-engine/types';
import { mondayOnOrBefore, weekBounds } from '@/lib/hours-engine/week-dates';
import { formatYmdInMadrid } from '@/lib/madrid-date-bounds';

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

function ymdKey(value: unknown): CivilDate {
  return String(value).split('T')[0]! as CivilDate;
}

/**
 * Cron semanal: solo materializa la semana en curso para perfiles activos en ella.
 *
 * `writeWeeklyProjection` sigue reconstruyendo correctamente el carry desde los
 * hechos históricos, pero al fijar from=to=currentWeek evitamos reescribir todas
 * las semanas de todos los empleados cada lunes (causa de los timeouts de 300 s).
 */
async function writeCurrentWeekProjectionForActiveEmployees(
  supabase: SupabaseClient,
): Promise<{
  weekStart: CivilDate;
  weekEnd: CivilDate;
  weeksWritten: number;
  employeeCount: number;
}> {
  const todayMadrid = formatYmdInMadrid(new Date());
  if (!todayMadrid) {
    throw new Error('No se pudo resolver la fecha actual de Madrid');
  }

  const weekStart = mondayOnOrBefore(ymdKey(todayMadrid));
  const { weekEnd } = weekBounds(weekStart);

  const { data: profiles, error: profilesErr } = await supabase
    .from('profiles')
    .select('id, joining_date, end_date');

  if (profilesErr) {
    throw new Error(`Listado de perfiles activos: ${profilesErr.message}`);
  }

  const userIds = [
    ...new Set(
      (profiles ?? [])
        .filter((row) => {
          const joiningDate = row.joining_date ? ymdKey(row.joining_date) : null;
          const endDate = row.end_date ? ymdKey(row.end_date) : null;
          return (
            (joiningDate == null || joiningDate <= weekEnd) &&
            (endDate == null || endDate >= weekStart)
          );
        })
        .map((row) => row.id)
        .filter(Boolean),
    ),
  ] as string[];

  const failures: string[] = [];
  let weeksWritten = 0;

  for (const userId of userIds) {
    const result = await writeWeeklyProjection(supabase, {
      userId,
      fromWeekStart: weekStart,
      toWeekStart: weekStart,
      processKind: 'cron',
    });

    if (!result.ok) {
      failures.push(`${userId}: ${result.error}`);
      continue;
    }

    weeksWritten += result.weeksWritten;
  }

  if (failures.length > 0) {
    throw new Error(
      `Writer de semana actual falló en ${failures.length} empleados. Primero: ${failures[0]}`,
    );
  }

  return {
    weekStart,
    weekEnd,
    weeksWritten,
    employeeCount: userIds.length,
  };
}

/**
 * Cron: Writer único de proyección (HE+Cost → weekly_snapshots).
 *
 * Auth: Authorization Bearer CRON_SECRET.
 *
 * Query:
 * - slot=winter|summer → guarda DST Madrid (CET=1 / CEST=2)
 * - mode omitido/current-week → escribe solo la semana actual de perfiles activos
 * - mode=full → recálculo histórico global manual
 * - mode=persist-only → compatibilidad legacy: Writer para empleados con snapshots
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

    if (mode === 'full') {
      console.log('[CRON_RECALC] Writer global histórico', { slot });
      const result = await recalculateAllBalancesAndPersist(supabase);
      console.log('[CRON_RECALC] Full OK', result);
      return NextResponse.json({
        success: true,
        mode: 'full',
        weeksPersisted: result.weeksPersisted,
        employeeCount: result.employeeCount,
        rpcData: result.rpcData,
      });
    }

    console.log('[CRON_RECALC] Writer semana actual', { slot });
    const result = await writeCurrentWeekProjectionForActiveEmployees(supabase);
    console.log('[CRON_RECALC] Current-week OK', result);
    return NextResponse.json({
      success: true,
      mode: 'current-week',
      ...result,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[CRON_RECALC_ERROR]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
