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

export type CompanyPayrollFact = SchedulePayrollRow & { user_id: string };

export type CompanyCommonHourlyRate = {
  rate: number;
  period: string;
  employeesSampled: number;
  employeesInModalBand: number;
};

function medianSorted(values: readonly number[]): number {
  const middle = Math.floor(values.length / 2);
  return values.length % 2 === 1
    ? values[middle]!
    : (values[middle - 1]! + values[middle]!) / 2;
}

/**
 * Coste empresarial MÁS FRECUENTE, expresado en €/h para poder comparar
 * contratos de 8, 20 o 40 h sin confundir sus costes mensuales absolutos.
 * Una banda representa 1 €/h; dentro de la banda ganadora se usa la mediana
 * de los importes originales (sin redondear previamente los costes).
 * Se utiliza el último mes CERRADO con al menos dos trabajadores válidos.
 */
export function mostCommonCompanyHourlyRate(
  facts: readonly CompanyPayrollFact[],
  employeeFactsById: Record<string, EmployeeBoundaryFacts>,
): CompanyCommonHourlyRate | null {
  const periods = [...new Set(facts.map(f => f.period_ym))].sort().reverse();
  for (const period of periods) {
    const byEmployee = new Map<string, SchedulePayrollRow[]>();
    for (const f of facts) {
      if (f.period_ym !== period) continue;
      const list = byEmployee.get(f.user_id) ?? [];
      list.push(f);
      byEmployee.set(f.user_id, list);
    }
    const rates: number[] = [];
    for (const [id, rows] of byEmployee) {
      const employee = employeeFactsById[id];
      if (!employee) continue;
      const result = rateFromEmployeePayroll(employee, rows);
      if (result.rate != null && result.rate > 0 && Number.isFinite(result.rate)) {
        rates.push(result.rate);
      }
    }
    // Un solo trabajador no define un coste común en la empresa.
    if (rates.length < 2) continue;

    rates.sort((a, b) => a - b);
    const center = medianSorted(rates);
    const bands = new Map<number, number[]>();
    for (const rate of rates) {
      const key = Math.round(rate); // Modo de tarifas a 1 €/h.
      const members = bands.get(key) ?? [];
      members.push(rate);
      bands.set(key, members);
    }
    const mostCommon = [...bands.entries()].sort(([ka, a], [kb, b]) =>
      b.length - a.length || Math.abs(ka - center) - Math.abs(kb - center) || ka - kb
    )[0]!;
    return {
      rate: medianSorted(mostCommon[1]),
      period,
      employeesSampled: rates.length,
      employeesInModalBand: mostCommon[1].length,
    };
  }
  return null;
}

/** Tarifa versionada del trabajador para jornadas clasificadas íntegramente como extras. */
export function versionedOvertimeRateForDay(
  terms: readonly { valid_from: string; valid_to: string | null; overtime_cost_per_hour: number | string | null }[],
  day: string,
): number | null {
  const effective = terms.filter(t => t.valid_from <= day && (t.valid_to == null || t.valid_to >= day));
  if (effective.length !== 1) return null;
  const raw = effective[0]!.overtime_cost_per_hour;
  if (raw == null) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * El dato individual prevalece. Si no se puede obtener una tarifa individual
 * utilizable, un contrato vigente permite estimar con la tarifa modal de empresa.
 * Sin contrato no se imputan ordinarias (las horas se consideran extras).
 */
export function resolveOrdinaryScheduleHourlyRate(
  individual: number | null,
  hasContract: boolean,
  companyTypical: number | null,
): number | null {
  if (individual != null && Number.isFinite(individual) && individual > 0) return individual;
  if (!hasContract) return null;
  if (companyTypical != null && Number.isFinite(companyTypical) && companyTypical > 0) {
    return companyTypical;
  }
  return null;
}
