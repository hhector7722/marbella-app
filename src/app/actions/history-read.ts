'use server';

import { createClient } from '@/utils/supabase/server';
import { resolveSessionUser } from '@/lib/auth/resolve-session-user';
import {
  canReadEmployeeHistory,
} from '@/lib/staff/history-access';
import { resolveHistoryAccessScope } from '@/lib/staff/history-access-server';
import {
  buildEmployeeHistoryMonthFromEngine,
  buildEmployeeHistoryRangeFromEngine,
  buildEmployeeHistoryWeekFromEngine,
  buildWeekDetailFromEngine,
  type HistoryWeekDto,
  type WeekFooterDto,
} from '@/lib/read-models/week-display-from-engine';

export type { HistoryWeekDto, WeekFooterDto };

async function authorizeEmployeeHistoryRead(targetUserId: string) {
  const supabase = await createClient();
  const user = await resolveSessionUser(supabase);
  if (!user) return { ok: false as const, error: 'No autenticado' };

  const scope = await resolveHistoryAccessScope(supabase, user.id, user.email ?? '');
  if (!scope) return { ok: false as const, error: 'No autenticado' };

  if (!canReadEmployeeHistory(scope, targetUserId)) {
    return { ok: false as const, error: 'Sin permiso para ver este historial' };
  }

  return { ok: true as const, supabase };
}

export async function getEmployeeHistoryMonth(input: {
  userId: string;
  filterYear: number;
  filterMonth: number;
}): Promise<{ success: true; weeks: HistoryWeekDto[] } | { success: false; error: string }> {
  const auth = await authorizeEmployeeHistoryRead(input.userId);
  if (!auth.ok) return { success: false, error: auth.error };

  try {
    const weeks = await buildEmployeeHistoryMonthFromEngine(auth.supabase, input);
    return { success: true, weeks };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function getWeekDetailDto(input: {
  userId: string;
  weekStart: string;
}): Promise<
  | {
      success: true;
      workerName: string;
      days: Array<{
        date: string;
        hasLog: boolean;
        clockIn: string | null;
        clockOut: string | null;
        totalHours: number;
        extraHours: number;
      }>;
      summary: WeekFooterDto;
    }
  | { success: false; error: string }
> {
  const auth = await authorizeEmployeeHistoryRead(input.userId);
  if (!auth.ok) return { success: false, error: auth.error };

  try {
    const detail = await buildWeekDetailFromEngine(auth.supabase, input);
    return { success: true, ...detail };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Una semana con el mismo DTO que `/staff/history` (HistoryWeekDto).
 * CarryIn desde `weekly_snapshots.pending_balance`; no liquida el mes.
 * Usado por el mosaico Staff, horas extras → empleado y asistencia.
 */
export async function getEmployeeHistoryWeek(input: {
  userId: string;
  weekStart: string;
}): Promise<
  | {
      success: true;
      workerName: string;
      week: HistoryWeekDto;
      filterYear: number;
      filterMonth: number;
    }
  | { success: false; error: string }
> {
  const auth = await authorizeEmployeeHistoryRead(input.userId);
  if (!auth.ok) return { success: false, error: auth.error };

  try {
    const monday = input.weekStart.split('T')[0]!;
    const [y, m] = monday.split('-').map(Number);
    if (!y || !m) {
      return { success: false, error: 'weekStart inválido' };
    }

    const [{ data: profile }, week] = await Promise.all([
      auth.supabase
        .from('profiles')
        .select('first_name, last_name')
        .eq('id', input.userId)
        .maybeSingle(),
      buildEmployeeHistoryWeekFromEngine(auth.supabase, {
        userId: input.userId,
        weekStart: monday,
      }),
    ]);

    const workerName =
      `${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim() || '—';

    return {
      success: true,
      workerName,
      week,
      filterYear: y,
      filterMonth: m - 1,
    };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function getEmployeeHistoryRange(input: {
  userId: string;
  rangeStartIso: string;
  rangeEndIso: string;
}): Promise<{ success: true; weeks: HistoryWeekDto[] } | { success: false; error: string }> {
  const auth = await authorizeEmployeeHistoryRead(input.userId);
  if (!auth.ok) return { success: false, error: auth.error };

  try {
    const weeks = await buildEmployeeHistoryRangeFromEngine(auth.supabase, {
      userId: input.userId,
      rangeStart: new Date(input.rangeStartIso),
      rangeEnd: new Date(input.rangeEndIso),
    });
    return { success: true, weeks };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
