/** Obtención de tarifas de planificación desde datos económicos INDIVIDUALES. */
import type { EmployeeBoundaryFacts } from './hours-engine/types.ts';

export type SchedulePayrollRow = {
  period_ym: string;
  total_company_cost: number | string | null;
};

export type SchedulePayrollRate = {
  rate: number | null;
  period: string | null;
  reason: 'payroll' | 'missing' | 'ambiguous' | 'invalid';
};

/** Jornada contractual correspondiente al MES de ESA nómina, no a la jornada de hoy. */
export function payrollMonthContractedHours(employee: EmployeeBoundaryFacts, ym: string): number {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(ym)) return 0;
  const [year, month] = ym.split('-').map(Number);
  const days = new Date(Date.UTC(year!, month!, 0)).getUTCDate();
  let hours = 0;
  for (let d = 1; d <= days; d++) {
    const day = `${ym}-${String(d).padStart(2, '0')}`;
    if (employee.joiningDate && day < employee.joiningDate) continue;
    if (employee.endDate && day > employee.endDate) continue;
    const activeTerms = employee.terms.filter(t => t.effectiveFrom <= day && (t.effectiveTo == null || t.effectiveTo >= day));
    // Ante tramos corruptos, no calcular un denominador inventado.
    if (activeTerms.length > 1) return 0;
    const term = activeTerms[0];
    if (term && term.weeklyHours > 0) hours += term.weeklyHours / 7;
  }
  return hours;
}

/**
 * Selecciona la nómina más reciente disponible de ESTE empleado. No suma
 * dos nóminas ordinarias activas del mismo periodo ni elige una arbitrariamente.
 * Si una misma nómina aparece duplicada con idéntico importe, se usa una sola.
 */
export function rateFromEmployeePayroll(
  employee: EmployeeBoundaryFacts,
  rows: readonly SchedulePayrollRow[],
): SchedulePayrollRate {
  const byMonth = new Map<string, number[]>();
  for (const row of rows) {
    const list = byMonth.get(row.period_ym) ?? [];
    const raw = row.total_company_cost;
    // null explícito es distinto de cero; un importe faltante no se convierte en 0.
    const n = raw == null ? NaN : Number(raw);
    list.push(n);
    byMonth.set(row.period_ym, list);
  }
  const months = [...byMonth.keys()].sort().reverse();
  for (const ym of months) {
    const vals = byMonth.get(ym)!;
    if (vals.some(n => !Number.isFinite(n) || n <= 0)) {
      return { rate: null, period: ym, reason: 'invalid' };
    }
    const unique = new Set(vals.map(n => n.toFixed(2)));
    if (unique.size !== 1) {
      return { rate: null, period: ym, reason: 'ambiguous' };
    }
    const hours = payrollMonthContractedHours(employee, ym);
    if (hours <= 0) return { rate: null, period: ym, reason: 'invalid' };
    return { rate: vals[0]! / hours, period: ym, reason: 'payroll' };
  }
  return { rate: null, period: null, reason: 'missing' };
}

/** La tarifa de extras es la del empleado en la fecha editada; el override semanal prevalece. */
export function overtimeRateForScheduleDay(
  employee: EmployeeBoundaryFacts,
  day: string,
  weeklyOverride: number | null | undefined,
): number | null {
  if (weeklyOverride != null) return Number.isFinite(weeklyOverride) && weeklyOverride >= 0 ? weeklyOverride : null;
  const matches = employee.terms.filter(t => t.effectiveFrom <= day && (t.effectiveTo == null || t.effectiveTo >= day));
  if (matches.length !== 1) return null;
  const rate = matches[0]!.overtimeRatePerHour;
  return rate != null && Number.isFinite(rate) && rate >= 0 ? rate : null;
}
