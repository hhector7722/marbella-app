/**
 * Lectura de actividades de barra por rango de fechas.
 * Pensado para el cliente (widget de horario): evita Server Actions, que en
 * Next refrescan la ruta al terminar y provocan parpadeo en el dashboard.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type BarActivity = {
  activityName: string;
  activityIcon: string | null;
  activityColor: string | null;
  startTime: string;
  endTime: string;
  formStartTime: string | null;
  formEndTime: string | null;
  totalParticipants: number | null;
  categories: string[];
  venueCodes: string[];
};

export type DayCalendarData = {
  date: string;
  totalCount: number;
  barActivities: BarActivity[];
};

export const ACTIVITY_OCCURRENCES_RANGE_SELECT = `
  activity_date,
  start_time,
  end_time,
  form_start_time,
  form_end_time,
  preferred_start_time,
  preferred_end_time,
  total_participants,
  activities ( name, color, active ),
  activity_kinds ( icon ),
  occurrence_venues ( venues ( code, affects_bar ) ),
  occurrence_groups ( participants, participant_categories ( name ) )
` as const;

export function groupOccurrencesToByDate(
  rows: readonly Record<string, unknown>[] | null | undefined,
): Record<string, DayCalendarData> {
  const byDate: Record<string, DayCalendarData> = {};

  for (const row of rows ?? []) {
    const act = row.activities as
      | { name: string; color: string | null; active: boolean | null }
      | null;
    if (act && act.active === false) continue;
    const d = row.activity_date as string;
    if (!byDate[d]) {
      byDate[d] = { date: d, totalCount: 0, barActivities: [] };
    }
    byDate[d].totalCount++;
    const venues =
      (
        row.occurrence_venues as
          | { venues: { code: string; affects_bar: boolean } }[]
          | null
          | undefined
      )?.map((ov) => ov.venues) ?? [];

    const barVenues = venues.filter((v) => v.affects_bar);
    const hasFormTimes = row.form_start_time !== null;
    const fromReportForm = row.preferred_start_time === 'form' && venues.length === 0;
    if (barVenues.length > 0 || hasFormTimes || fromReportForm) {
      const prefStart = row.preferred_start_time as string;
      const prefEnd = row.preferred_end_time as string;
      const formStart = row.form_start_time as string | null;
      const formEnd = row.form_end_time as string | null;
      const totalParticipants = row.total_participants as number | null;
      const occurrenceGroups = (row.occurrence_groups as { participant_categories?: { name?: string } | null }[] | null) || [];
      const categories = occurrenceGroups
        .map((g) => g.participant_categories?.name)
        .filter((name): name is string => Boolean(name));

      const finalStart =
        prefStart === 'form' && formStart ? formStart : (row.start_time as string);
      const finalEnd = prefEnd === 'form' && formEnd ? formEnd : (row.end_time as string);

      byDate[d].barActivities.push({
        activityName: (row.activities as { name: string; color: string | null }).name,
        activityIcon:
          (row.activity_kinds as { icon: string | null } | null)?.icon ?? null,
        activityColor: (row.activities as { name: string; color: string | null }).color ?? null,
        startTime: finalStart,
        endTime: finalEnd,
        formStartTime: formStart,
        formEndTime: formEnd,
        totalParticipants,
        categories,
        venueCodes: barVenues.map((v) => v.code),
      });
    }
  }

  return byDate;
}

export async function fetchBarActivitiesForRangeClient(
  supabase: SupabaseClient,
  startDate: string,
  endDate: string,
): Promise<
  | { success: true; byDate: Record<string, DayCalendarData> }
  | { success: false; error: string }
> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return { success: false, error: 'Rango de fechas no válido.' };
  }

  const { data, error } = await supabase
    .from('activity_occurrences')
    .select(ACTIVITY_OCCURRENCES_RANGE_SELECT)
    .gte('activity_date', startDate)
    .lte('activity_date', endDate)
    .order('activity_date', { ascending: true })
    .order('start_time', { ascending: true });

  if (error) {
    return { success: false, error: error.message ?? 'Error al cargar datos.' };
  }

  return {
    success: true,
    byDate: groupOccurrencesToByDate((data ?? []) as Record<string, unknown>[]),
  };
}
