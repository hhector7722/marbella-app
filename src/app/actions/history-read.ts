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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isMissingProjectionError(message: string): boolean {
  return message.startsWith('Proyección v2 ausente para la semana ');
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
      error: errorMessage(e),
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
      error: errorMessage(e),
    };
  }
}

/**
 * Una semana con el mismo DTO que `/staff/history` (HistoryWeekDto).
 * Footer y Ex del día desde proyección v2; no liquida.
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

  const monday = input.weekStart.split('T')[0]!;
  const [y, m] = monday.split('-').map(Number);
  if (!y || !m) {
    return { success: false, error: 'weekStart inválido' };
  }

  try {
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
    const message = errorMessage(e);

    // El lector de una sola semana es estricto y exige snapshot. Para semanas
    // sin proyección reutilizamos el lector mensual, que ya distingue el caso
    // normal "sin snapshot y sin fichajes" (semana vacía) del caso realmente
    // inconsistente "hay fichajes pero falta proyección" (error visible).
    if (isMissingProjectionError(message)) {
      try {
        const [{ data: profile }, weeks] = await Promise.all([
          auth.supabase
            .from('profiles')
            .select('first_name, last_name')
            .eq('id', input.userId)
            .maybeSingle(),
          buildEmployeeHistoryMonthFromEngine(auth.supabase, {
            userId: input.userId,
            filterYear: y,
            filterMonth: m - 1,
          }),
        ]);
        const week = weeks.find((candidate) => candidate.startDate.split('T')[0] === monday);
        if (week) {
          const workerName =
            `${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim() || '—';
          return {
            success: true,
            workerName,
            week,
            filterYear: y,
            filterMonth: m - 1,
          };
        }
      } catch (fallbackError) {
        return {
          success: false,
          error: errorMessage(fallbackError),
        };
      }
    }

    return {
      success: false,
      error: message,
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
      error: errorMessage(e),
    };
  }
}
