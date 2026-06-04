import {
  tipAmountWithoutPenalty,
  tipTheoreticalPoolAmounts,
  type StaffTipHistoryEntry,
} from '@/lib/tip-distribution-display';

export function staffEntryPenaltyAmount(entry: {
  totalAmount: number;
  penalizacionPct: number;
}): number {
  const pen = entry.penalizacionPct ?? 0;
  if (pen <= 0 || pen >= 100) return 0;
  return (entry.totalAmount * pen) / (100 - pen);
}

/** Importes del tramo sin penalización TJI (desde línea de historial). */
export function staffEntryAmountsWithoutPenalty(entry: StaffTipHistoryEntry): {
  weekday: number;
  weekend: number;
  total: number;
} {
  const wd = tipAmountWithoutPenalty(
    entry.weekdayAmount,
    entry.weekdayHours,
    entry.weekdayHoursEffective
  );
  const we = tipAmountWithoutPenalty(
    entry.weekendAmount,
    entry.weekendHours,
    entry.weekendHoursEffective
  );
  return { weekday: wd, weekend: we, total: wd + we };
}

/** Teórico por tramo vía penalización sobre importe (fallback si no hay horas efectivas). */
export function staffEntryTheoreticalByPenalty(entry: StaffTipHistoryEntry): {
  weekday: number;
  weekend: number;
  total: number;
} {
  const t = tipTheoreticalPoolAmounts({
    weekdayAmount: entry.weekdayAmount,
    weekendAmount: entry.weekendAmount,
    weekdayHoursRaw: entry.weekdayHours,
    weekendHoursRaw: entry.weekendHours,
    penalizacionPct: entry.penalizacionPct,
    penaltyAmount: staffEntryPenaltyAmount(entry),
  });
  return { weekday: t.weekday, weekend: t.weekend, total: t.total };
}

export function staffEntryPropinaSinPen(entry: StaffTipHistoryEntry): {
  weekday: number;
  weekend: number;
  total: number;
} {
  const byHours = staffEntryAmountsWithoutPenalty(entry);
  if (byHours.total >= 0.005) return byHours;
  return staffEntryTheoreticalByPenalty(entry);
}

export function staffEntryHoursTotal(entry: StaffTipHistoryEntry): number {
  return entry.weekdayHours + entry.weekendHours;
}
