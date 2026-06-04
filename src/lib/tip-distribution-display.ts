import { format } from 'date-fns';
import { es } from 'date-fns/locale';

/** Evita timezone shift: parsea YYYY-MM-DD en calendario local. */
export function parseLocalIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addLocalDaysIso(iso: string, days: number): string {
  const dt = parseLocalIsoDate(iso);
  dt.setDate(dt.getDate() + days);
  return format(dt, 'yyyy-MM-dd');
}

export function formatLocalIsoDateLabel(iso: string, pattern = 'd MMM yyyy'): string {
  try {
    return format(parseLocalIsoDate(iso), pattern, { locale: es });
  } catch {
    return iso;
  }
}

export function tjiColorClass(tjiPct: number): string {
  if (tjiPct <= 5) return 'text-emerald-600';
  if (tjiPct <= 15) return 'text-amber-500';
  if (tjiPct <= 25) return 'text-orange-500';
  return 'text-rose-600';
}

export function formatPenalizacionPct(penalizacionPct: number): string {
  if (penalizacionPct <= 0) return '—';
  return `-${penalizacionPct}%`;
}

export function formatEffectiveHours(weekday: number, weekend: number): string {
  const w = Math.abs(weekday) < 0.005 ? '' : (weekday % 1 === 0 ? weekday.toFixed(0) : weekday.toFixed(1));
  const we = Math.abs(weekend) < 0.005 ? '' : (weekend % 1 === 0 ? weekend.toFixed(0) : weekend.toFixed(1));
  if (!w && !we) return ' ';
  if (!we) return w;
  if (!w) return we;
  return `${w}/${we}`;
}

export type TipDistributionHistoryRow = {
  id: string;
  period_start: string;
  period_end: string;
  weekday_total: number;
  weekend_total: number;
  confirmed_at: string;
  notes: string | null;
};

export type StaffTipHistoryEntry = {
  lineId: string;
  distributionId: string;
  totalAmount: number;
  weekdayAmount: number;
  weekendAmount: number;
  weekdayHours: number;
  weekendHours: number;
  weekdayHoursEffective: number;
  weekendHoursEffective: number;
  jornadasTotales: number;
  jornadasConOlvido: number;
  tjiPct: number;
  penalizacionPct: number;
  weekdayBonus: number;
  weekendBonus: number;
  isSanctioned: boolean;
  periodStart: string;
  periodEnd: string;
  confirmedAt: string;
};

/** Coste aproximado de la penalización TJI: reparto sin penalizar − reparto actual. */
export function estimateTjiPenaltyCostEur(row: {
  totalAmount: number;
  weekdayHoursRaw: number;
  weekendHoursRaw: number;
  weekdayHoursEffective: number;
  weekendHoursEffective: number;
  penalizacionPct: number;
}): number {
  const pen = row.penalizacionPct ?? 0;
  if (pen <= 0) return 0;
  const eff =
    (row.weekdayHoursEffective ?? 0) + (row.weekendHoursEffective ?? 0);
  const raw = row.weekdayHoursRaw + row.weekendHoursRaw;
  if (eff < 0.005 || raw < 0.005) return 0;
  const amountWithout = row.totalAmount * (raw / eff);
  return Math.max(0, amountWithout - row.totalAmount);
}

export function formatTipMoney(val: number): string {
  if (Math.abs(val) < 0.005) return ' ';
  return `${val.toFixed(2)} €`;
}

/** Pagado vs importe teórico tachado cuando el empleado está sancionado. */
export function getShadowTipDisplay(
  amount: number,
  shadowAmount: number | null | undefined,
  isSanctioned?: boolean,
  format: (n: number) => string = formatTipMoney
): { paid: string; shadow: string | null } {
  if (isSanctioned && shadowAmount != null && Math.abs(shadowAmount) >= 0.005) {
    return { paid: ' ', shadow: format(shadowAmount) };
  }
  return { paid: format(amount), shadow: null };
}

export function formatTipPct(val: number): string {
  if (Math.abs(val) < 0.005) return ' ';
  return `${val.toFixed(1)}%`;
}

export function formatTipInt(val: number): string {
  if (val <= 0) return ' ';
  return String(val);
}

/** Importe del tramo si las horas no tuvieran penalización TJI (escala raw/efectivas). */
export function tipAmountWithoutPenalty(
  amount: number,
  rawHours: number,
  effectiveHours: number
): number {
  if (Math.abs(amount) < 0.005) return 0;
  if (effectiveHours < 0.005) return amount;
  if (rawHours <= effectiveHours + 0.005) return amount;
  return amount * (rawHours / effectiveHours);
}

export function tipTotalWithoutPenalty(row: {
  weekdayAmount: number;
  weekendAmount: number;
  weekdayHoursRaw: number;
  weekendHoursRaw: number;
  weekdayHours: number;
  weekendHours: number;
}): number {
  const wdH = row.weekdayHours;
  const weH = row.weekendHours;
  return (
    tipAmountWithoutPenalty(row.weekdayAmount, row.weekdayHoursRaw, wdH) +
    tipAmountWithoutPenalty(row.weekendAmount, row.weekendHoursRaw, weH)
  );
}

/** Importes teóricos por tramo (antes de penalización TJI sobre importe). */
export function tipTheoreticalPoolAmounts(row: {
  weekdayAmount: number;
  weekendAmount: number;
  weekdayHoursRaw: number;
  weekendHoursRaw: number;
  penalizacionPct?: number;
  penaltyAmount?: number;
  isSanctioned?: boolean;
  shadowWeekdayAmount?: number | null;
  shadowWeekendAmount?: number | null;
}): { weekday: number; weekend: number; total: number } {
  const wdPaid =
    row.isSanctioned &&
    row.shadowWeekdayAmount != null &&
    Math.abs(row.shadowWeekdayAmount) >= 0.005
      ? row.shadowWeekdayAmount
      : row.weekdayAmount;
  const wePaid =
    row.isSanctioned &&
    row.shadowWeekendAmount != null &&
    Math.abs(row.shadowWeekendAmount) >= 0.005
      ? row.shadowWeekendAmount
      : row.weekendAmount;
  const pen = row.penalizacionPct ?? 0;
  const penalty = row.penaltyAmount ?? 0;
  const poolTotal =
    pen > 0 && Math.abs(penalty) >= 0.005 ? (penalty * 100) / pen : wdPaid + wePaid;
  const rawSum = row.weekdayHoursRaw + row.weekendHoursRaw;
  if (rawSum < 0.005) {
    return { weekday: 0, weekend: 0, total: poolTotal };
  }
  return {
    weekday: (poolTotal * row.weekdayHoursRaw) / rawSum,
    weekend: (poolTotal * row.weekendHoursRaw) / rawSum,
    total: poolTotal,
  };
}

/** Celda SIN REG: jornadas con olvido + % TJI (ej. «10 - 21%»). */
export function formatSinRegCell(jornadasConOlvido: number, tjiPct: number): string {
  const j = jornadasConOlvido > 0 ? String(jornadasConOlvido) : ' ';
  const p = Math.abs(tjiPct) < 0.005 ? ' ' : `${tjiPct.toFixed(0)}%`;
  if (j === ' ' && p === ' ') return ' ';
  if (j === ' ') return p;
  if (p === ' ') return j;
  return `${j} - ${p}`;
}
