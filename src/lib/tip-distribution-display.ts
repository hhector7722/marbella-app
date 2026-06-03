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

export function formatTipPct(val: number): string {
  if (Math.abs(val) < 0.005) return ' ';
  return `${val.toFixed(1)}%`;
}

export function formatTipInt(val: number): string {
  if (val <= 0) return ' ';
  return String(val);
}
