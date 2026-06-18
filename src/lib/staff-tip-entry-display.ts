import {
  penalizacionColorClass,
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

/** Reconstruye horas raw desde efectivas + % penalización TJI (no persistidas en historial). */
function reconstructRawHours(effective: number, penalizacionPct: number): number {
  if (effective < 0.005) return 0;
  if (penalizacionPct <= 0 || penalizacionPct >= 100) return effective;
  return effective / (1 - penalizacionPct / 100);
}

/** Importe teórico sin penalización TJI (lo que debería cobrar antes del dto.). */
export function staffEntryTheoreticalPayout(entry: StaffTipHistoryEntry): number {
  const pen = entry.penalizacionPct ?? 0;

  if (!entry.isSanctioned && pen > 0 && pen < 100) {
    const byPenalty = staffEntryTheoreticalByPenalty(entry);
    if (byPenalty.total >= 0.005) return byPenalty.total;
  }

  const wdEff = entry.weekdayHoursEffective;
  const weEff = entry.weekendHoursEffective;
  const wdRaw = reconstructRawHours(wdEff, pen);
  const weRaw = reconstructRawHours(weEff, pen);
  const byHours =
    tipAmountWithoutPenalty(entry.weekdayAmount, wdRaw, wdEff) +
    tipAmountWithoutPenalty(entry.weekendAmount, weRaw, weEff);

  if (byHours >= 0.005) return byHours;

  if (entry.isSanctioned && (wdEff + weEff) > 0.005) {
    return Math.max(entry.totalAmount, 0.005);
  }

  return Math.max(entry.totalAmount, 0);
}

/** Importes del tramo sin penalización TJI (desde línea de historial). */
export function staffEntryAmountsWithoutPenalty(entry: StaffTipHistoryEntry): {
  weekday: number;
  weekend: number;
  total: number;
} {
  const pen = entry.penalizacionPct ?? 0;
  const wdEff = entry.weekdayHoursEffective;
  const weEff = entry.weekendHoursEffective;
  const wd = tipAmountWithoutPenalty(
    entry.weekdayAmount,
    reconstructRawHours(wdEff, pen),
    wdEff
  );
  const we = tipAmountWithoutPenalty(
    entry.weekendAmount,
    reconstructRawHours(weEff, pen),
    weEff
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
  const pen = entry.penalizacionPct ?? 0;
  if (!entry.isSanctioned && pen > 0 && pen < 100) {
    return staffEntryTheoreticalByPenalty(entry);
  }
  const byHours = staffEntryAmountsWithoutPenalty(entry);
  if (byHours.total >= 0.005) return byHours;
  return staffEntryTheoreticalByPenalty(entry);
}

export function staffEntryHoursTotal(entry: StaffTipHistoryEntry): number {
  return entry.weekdayHours + entry.weekendHours;
}

export type TipAdjustmentKind = 'penalizacion' | 'bonificacion' | 'ninguna';

const TIP_AMOUNT_EPS = 0.005;

/** Compara propina sin ajuste vs final cobrada. */
export function getTipAdjustmentKind(
  amountSinPen: number,
  amountFinal: number
): TipAdjustmentKind {
  const diff = amountSinPen - amountFinal;
  if (Math.abs(diff) < TIP_AMOUNT_EPS) return 'ninguna';
  if (diff > TIP_AMOUNT_EPS) return 'penalizacion';
  return 'bonificacion';
}

export function getTipAdjustmentLabel(kind: TipAdjustmentKind): string {
  if (kind === 'bonificacion') return 'Bonificación';
  return 'Penalización';
}

export function formatTipAdjustmentValue(
  kind: TipAdjustmentKind,
  penalizacionPct: number,
  amountSinPen: number,
  amountFinal: number
): string {
  if (kind === 'ninguna') return 'Sin penalización';
  if (penalizacionPct > 0) {
    return kind === 'bonificacion' ? `+${penalizacionPct}%` : `${penalizacionPct}%`;
  }
  if (amountSinPen < TIP_AMOUNT_EPS) return ' ';
  const pct = Math.abs(((amountFinal - amountSinPen) / amountSinPen) * 100);
  if (pct < 0.05) return ' ';
  const rounded = pct % 1 === 0 ? pct.toFixed(0) : pct.toFixed(1);
  return kind === 'bonificacion' ? `+${rounded}%` : `${rounded}%`;
}

export function tipAdjustmentValueClass(kind: TipAdjustmentKind, penalizacionPct: number): string {
  if (kind === 'ninguna') return 'text-zinc-500';
  if (kind === 'bonificacion') return 'text-emerald-600';
  return penalizacionColorClass(penalizacionPct);
}
