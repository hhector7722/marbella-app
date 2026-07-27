'use server';

import { createClient } from '@/utils/supabase/server';
import {
  buildEmployeeHistoryMonthFromSnapshots,
  buildWeekDetailFromSnapshots,
  type HistoryWeekDto,
  type WeekFooterDto,
} from '@/lib/read-models/weekly-snapshot-dto';

export type { HistoryWeekDto, WeekFooterDto };

export async function getEmployeeHistoryMonth(input: {
  userId: string;
  filterYear: number;
  filterMonth: number;
}): Promise<{ success: true; weeks: HistoryWeekDto[] } | { success: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'No autenticado' };

  try {
    const weeks = await buildEmployeeHistoryMonthFromSnapshots(supabase, input);
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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'No autenticado' };

  try {
    const detail = await buildWeekDetailFromSnapshots(supabase, input);
    return { success: true, ...detail };
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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'No autenticado' };

  try {
    const { buildEmployeeHistoryRangeFromSnapshots } = await import(
      '@/lib/read-models/weekly-snapshot-dto'
    );
    const weeks = await buildEmployeeHistoryRangeFromSnapshots(supabase, {
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
