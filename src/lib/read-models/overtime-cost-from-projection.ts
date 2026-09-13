/**
 * Lectura del € extra diario persistido (PROYECCION-v2).
 * Sin Hours Engine.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CivilDate } from '../hours-engine/types.ts';
import { addCivilDays, mondayOnOrBefore } from '../hours-engine/week-dates.ts';

export type OvertimeDayCost = {
  overtimeCost: number;
  overtimeHours: number;
};

function dayKey(value: unknown): CivilDate {
  return String(value).split('T')[0]! as CivilDate;
}

function listCivilDaysInclusive(fromYmd: string, toYmd: string): CivilDate[] {
  const from = dayKey(fromYmd);
  const to = dayKey(toYmd);
  const days: CivilDate[] = [];
  let cur = from;
  while (cur <= to) {
    days.push(cur);
    cur = addCivilDays(cur, 1);
  }
  return days;
}

export async function loadOvertimeCostByDay(
  supabase: SupabaseClient,
  userIds: readonly string[],
  fromYmd: string,
  toYmd: string,
): Promise<Map<string, Map<string, OvertimeDayCost>>> {
  const byUser = new Map<string, Map<string, OvertimeDayCost>>();
  if (userIds.length === 0) return byUser;

  const from = dayKey(fromYmd);
  const to = dayKey(toYmd);
  const fromMonday = mondayOnOrBefore(from);
  const toMonday = mondayOnOrBefore(to);

  const [daysRes, snapsRes] = await Promise.all([
    supabase
      .from('weekly_snapshot_days')
      .select('user_id, day, overtime_cost, overtime_hours')
      .in('user_id', userIds)
      .gte('day', from)
      .lte('day', to),
    supabase
      .from('weekly_snapshots')
      .select('user_id, week_start')
      .in('user_id', userIds)
      .gte('week_start', fromMonday)
      .lte('week_start', toMonday),
  ]);

  if (daysRes.error) {
    throw new Error(`weekly_snapshot_days: ${daysRes.error.message}`);
  }
  if (snapsRes.error) {
    throw new Error(`weekly_snapshots: ${snapsRes.error.message}`);
  }

  for (const row of daysRes.data ?? []) {
    const userId = String(row.user_id);
    const day = dayKey(row.day);
    let perDay = byUser.get(userId);
    if (!perDay) {
      perDay = new Map();
      byUser.set(userId, perDay);
    }
    perDay.set(day, {
      overtimeCost: Number(row.overtime_cost) || 0,
      overtimeHours: Number(row.overtime_hours) || 0,
    });
  }

  const snapWeeks = new Set<string>();
  for (const row of snapsRes.data ?? []) {
    snapWeeks.add(`${row.user_id}:${dayKey(row.week_start)}`);
  }

  for (const userId of userIds) {
    const perDay = byUser.get(userId);
    for (const day of listCivilDaysInclusive(from, to)) {
      const monday = mondayOnOrBefore(day);
      if (!snapWeeks.has(`${userId}:${monday}`)) continue;
      if (!perDay?.has(day)) {
        throw new Error(
          `Proyección v2 ausente para ${userId} el ${day}. Regenerar con el Writer.`,
        );
      }
    }
  }

  return byUser;
}
