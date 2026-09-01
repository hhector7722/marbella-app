'use server';

import { createClient } from '@/utils/supabase/server';
import { resolveSessionUser } from '@/lib/auth/resolve-session-user';
import {
  buildEmployeeHistoryMonthFromEngine,
  buildEmployeeHistoryRangeFromEngine,
  buildWeekDetailFromEngine,
  type HistoryWeekDto,
  type WeekFooterDto,
} from '@/lib/read-models/week-display-from-engine';

export type { HistoryWeekDto, WeekFooterDto };

export async function getEmployeeHistoryMonth(input: {
  userId: string;
  filterYear: number;
  filterMonth: number;
}): Promise<{ success: true; weeks: HistoryWeekDto[] } | { success: false; error: string }> {
  const supabase = await createClient();
  const user = await resolveSessionUser();
  if (!user) return { success: false, error: 'No autenticado' };

  try {
    const weeks = await buildEmployeeHistoryMonthFromEngine(supabase, input);
    console.log(`[DEBUG] getEmployeeHistoryMonth for ${input.userId} - Week 27 Summary:`, weeks.find(w => w.startDate.startsWith('2026-06-29'))?.summary);
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
  const supabase = await createClient();
  const user = await resolveSessionUser();
  if (!user) return { success: false, error: 'No autenticado' };

  try {
    const detail = await buildWeekDetailFromEngine(supabase, input);
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
  const supabase = await createClient();
  const user = await resolveSessionUser();
  if (!user) return { success: false, error: 'No autenticado' };

  try {
    const monday = input.weekStart.split('T')[0]!;
    const [y, m] = monday.split('-').map(Number);
    if (!y || !m) {
      return { success: false, error: 'weekStart inválido' };
    }

    let filterYear = y;
    let filterMonth = m - 1;

    const findWeek = (weeks: HistoryWeekDto[]) =>
      weeks.find((w) => w.startDate.split('T')[0] === monday) ?? null;

    const [{ data: profile }, weeksPrimary] = await Promise.all([
      supabase
        .from('profiles')
        .select('first_name, last_name')
        .eq('id', input.userId)
        .maybeSingle(),
      buildEmployeeHistoryMonthFromEngine(supabase, {
        userId: input.userId,
        filterYear,
        filterMonth,
      }),
    ]);

    let weeks = weeksPrimary;
    let week = findWeek(weeks);

    // Semana que toca el mes anterior (p. ej. lunes 30 jun → jul): probar mes previo
    if (!week) {
      const prev = new Date(filterYear, filterMonth - 1, 1);
      filterYear = prev.getFullYear();
      filterMonth = prev.getMonth();
      weeks = await buildEmployeeHistoryMonthFromEngine(supabase, {
        userId: input.userId,
        filterYear,
        filterMonth,
      });
      week = findWeek(weeks);
    }

    if (!week) {
      return { success: false, error: 'Semana no encontrada en historial' };
    }

    const workerName =
      `${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim() || '—';

    return {
      success: true,
      workerName,
      week,
      filterYear,
      filterMonth,
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
  const supabase = await createClient();
  const user = await resolveSessionUser();
  if (!user) return { success: false, error: 'No autenticado' };

  try {
    const weeks = await buildEmployeeHistoryRangeFromEngine(supabase, {
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
