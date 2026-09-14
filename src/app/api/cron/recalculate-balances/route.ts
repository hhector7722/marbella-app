import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  persistOvertimeCostForEmployees,
  recalculateAllBalancesAndPersist,
} from '@/lib/hours-engine/recalculate-and-persist-all';
import { writeWeeklyProjection } from '@/lib/hours-engine/projection';
import type { CivilDate } from '@/lib/hours-engine/types';
import { mondayOnOrBefore, weekBounds } from '@/lib/hours-engine/week-dates';
import { formatYmdInMadrid, madridRangeUtcIso } from '@/lib/madrid-date-bounds';

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
 * Cron semanal: materializa la semana en curso para quien tenga un tramo
 * contractual que solape la semana y para cualquier usuario con fichajes en ella.
 *
 * La vigencia contractual se obtiene de `hours_contract_terms`, no de
 * `profiles.end_date`: este último es solo espejo y puede quedar desfasado entre
 * tramos. Además, un fichaje real es un hecho autoritativo y nunca puede quedarse
 * sin proyección por no existir un tramo efectivo esa semana.
 *
 * `writeWeeklyProjection` sigue reconstruyendo correctamente el carry desde los
 * hechos históricos, pero al fijar from=to=currentWeek evitamos reescribir todas
 * las semanas de todos los empleados cada lunes (causa de los timeouts de 300 s).
 */
async function writeCurrentWeekProjectionForRelevantEmployees(
  supabase: SupabaseClient,
): Promise<{
  weekStart: CivilDate;
  weekEnd: CivilDate;
  weeksWritten: number;
  employeeCount: number;
  contractEmployeeCount: number;
  attendanceEmployeeCount: number;
}> {
  const todayMadrid = formatYmdInMadrid(new Date());
  if (!todayMadrid) {
    throw new Error('No se pudo resolver la fecha actual de Madrid');
  }

  const weekStart = mondayOnOrBefore(ymdKey(todayMadrid));
  const { weekEnd } = weekBounds(weekStart);
  const { startIso, endIso } = madridRangeUtcIso(weekStart, weekEnd);

  const [termsRes, logsRes] = await Promise.all([
    supabase
      .from('hours_contract_terms')
      .select('user_id, effective_from, effective_to'),
    supabase
      .from('time_logs')
      .select('user_id')
      .gte('clock_in', startIso)
      .lte('clock_in', endIso),
  ]);

  if (termsRes.error) {
    throw new Error(`Listado de tramos contractuales: ${termsRes.error.message}`);
  }
  if (logsRes.error) {
    throw new Error(`Fichajes de la semana actual: ${logsRes.error.message}`);
  }

  const contractUserIds = [
    ...new Set(
      (termsRes.data ?? [])
        .filter((row) => {
          const from = row.effective_from ? ymdKey(row.effective_from) : null;
          const to = row.effective_to ? ymdKey(row.effective_to) : null;
          return from != null && from <= weekEnd && (to == null || to >= weekStart);
        })
        .map((row) => row.user_id)
        .filter(Boolean),
    ),
  ] as string[];

  const attendanceUserIds = [
    ...new Set((logsRes.data ?? []).map((row) => row.user_id).filter(Boolean)),
  ] as string[];

  const userIds = [...new Set([...contractUserIds, ...attendanceUserIds])];

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
    contractEmployeeCount: contractUserIds.length,
    attendanceEmployeeCount: attendanceUserIds.length,
  };
}

/**
 * Cron: Writer único de proyección (HE+Cost → weekly_snapshots).
 *
 * Auth: Authorization Bearer CRON_SECRET.
 *
 * Query:
 * - slot=winter|summer → guarda DST Madrid (CET=1 / CEST=2)
 * - mode omitido/current-week → semana actual de usuarios con contrato o fichajes
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
    const result = await writeCurrentWeekProjectionForRelevantEmployees(supabase);
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
