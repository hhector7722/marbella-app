import type { StaffTipHistoryEntry } from '@/lib/tip-distribution-display';

type HistoryJoin = {
  period_start: string;
  period_end: string;
  confirmed_at: string;
};

export type TipDistributionLineRow = {
  id: string;
  distribution_id: string;
  total_amount: number | string;
  weekday_amount: number | string;
  weekend_amount: number | string;
  weekday_hours: number | string;
  weekend_hours: number | string;
  weekday_hours_effective: number | string;
  weekend_hours_effective: number | string;
  jornadas_totales: number | string;
  jornadas_con_olvido: number | string;
  tji_pct: number | string;
  penalizacion_pct: number | string;
  weekday_bonus: number | string;
  weekend_bonus: number | string;
  is_sanctioned: boolean;
  tip_distribution_history: HistoryJoin | HistoryJoin[] | null;
};

function pickHistoryJoin(
  joined: HistoryJoin | HistoryJoin[] | null | undefined
): HistoryJoin | null {
  if (!joined) return null;
  if (Array.isArray(joined)) return joined[0] ?? null;
  return joined;
}

export function mapStaffTipHistoryRows(
  linesRaw: TipDistributionLineRow[] | null | undefined
): StaffTipHistoryEntry[] {
  return (linesRaw ?? [])
    .map((row) => {
      const h = pickHistoryJoin(row.tip_distribution_history);
      if (!h) return null;
      return {
        lineId: row.id,
        distributionId: row.distribution_id,
        totalAmount: Number(row.total_amount),
        weekdayAmount: Number(row.weekday_amount),
        weekendAmount: Number(row.weekend_amount),
        weekdayHours: Number(row.weekday_hours),
        weekendHours: Number(row.weekend_hours),
        weekdayHoursEffective: Number(row.weekday_hours_effective),
        weekendHoursEffective: Number(row.weekend_hours_effective),
        jornadasTotales: Number(row.jornadas_totales),
        jornadasConOlvido: Number(row.jornadas_con_olvido),
        tjiPct: Number(row.tji_pct),
        penalizacionPct: Number(row.penalizacion_pct),
        weekdayBonus: Number(row.weekday_bonus),
        weekendBonus: Number(row.weekend_bonus),
        isSanctioned: Boolean(row.is_sanctioned),
        periodStart: h.period_start,
        periodEnd: h.period_end,
        confirmedAt: h.confirmed_at,
      };
    })
    .filter((e): e is StaffTipHistoryEntry => e != null)
    .sort(
      (a, b) => new Date(b.confirmedAt).getTime() - new Date(a.confirmedAt).getTime()
    );
}

export const STAFF_TIP_HISTORY_SELECT = `
  id,
  distribution_id,
  total_amount,
  weekday_amount,
  weekend_amount,
  weekday_hours,
  weekend_hours,
  weekday_hours_effective,
  weekend_hours_effective,
  jornadas_totales,
  jornadas_con_olvido,
  tji_pct,
  penalizacion_pct,
  weekday_bonus,
  weekend_bonus,
  is_sanctioned,
  tip_distribution_history (
    period_start,
    period_end,
    confirmed_at
  )
` as const;
