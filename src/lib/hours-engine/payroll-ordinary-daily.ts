/**
 * Prorrateo de nómina oficial a coste ordinario diario.
 * Regla: días naturales del periodo (period_end − period_start + 1).
 * No usa tarifas ni días trabajados.
 */

import { addDays, format, parseISO } from 'date-fns';

function listYmdInclusive(startYmd: string, endYmd: string): string[] {
  const out: string[] = [];
  let d = startYmd.split('T')[0]!;
  const end = endYmd.split('T')[0]!;
  while (d <= end) {
    out.push(d);
    d = format(addDays(parseISO(d), 1), 'yyyy-MM-dd');
  }
  return out;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Reparte el coste mensual en días naturales del periodo PDF.
 * Σ días = total_company_cost (centésimas: último día absorbe el resto).
 */
export function allocatePayrollToNaturalDays(
  totalCompanyCost: number,
  periodStart: string,
  periodEnd: string,
): Record<string, number> {
  const days = listYmdInclusive(periodStart, periodEnd);
  const n = days.length;
  if (n === 0 || !(totalCompanyCost > 0)) return {};

  const out: Record<string, number> = {};
  const base = Math.floor((totalCompanyCost / n) * 100) / 100;
  let allocated = 0;
  for (let i = 0; i < n; i++) {
    const amount =
      i === n - 1 ? round2(totalCompanyCost - allocated) : base;
    out[days[i]!] = amount;
    allocated = round2(allocated + amount);
  }
  return out;
}

export function monthKeysCovering(startYmd: string, endYmd: string): string[] {
  const keys: string[] = [];
  let [y, m] = startYmd.split('-').map(Number) as [number, number];
  const [ey, em] = endYmd.split('-').map(Number) as [number, number];
  while (y < ey || (y === ey && m <= em)) {
    keys.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return keys;
}
