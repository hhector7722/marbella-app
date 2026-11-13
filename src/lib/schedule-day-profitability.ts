/**
 * Previsión económica de turnos del editor.
 * Horas ordinarias/extras: reglas canónicas del Hours Engine.
 * Ordinarias: coste de empresa por hora de la última nómina ordinaria cerrada.
 * Extras: tarifa contractual/override del Cost Engine, sin recargo arbitrario.
 */
import { liquidateWeek } from './hours-engine/liquidation-engine.ts';
import { mondayOnOrBefore } from './hours-engine/week-dates.ts';
import type { EmployeeBoundaryFacts } from './hours-engine/types.ts';

export const SCHEDULE_LABOR_TARGET_RATIO = 0.30;

export type ScheduleShiftForCost = {
  employeeId: string;
  start: string;
  end: string;
  active?: boolean;
};

export type ScheduleLaborWorkerContext = {
  employee: EmployeeBoundaryFacts;
  ordinaryHourlyRate: number | null;
  overtimeHourlyRate: number | null;
  earlierHoursByDay: Record<string, number>;
  payrollPeriod: string | null;
};

export type ScheduleLaborCostContext = Record<string, ScheduleLaborWorkerContext>;

export type ScheduleDayCostResult = {
  totalCost: number | null;
  overtimeCost: number | null;
  ordinaryCost: number | null;
  ordinaryHours: number;
  overtimeHours: number;
  /** Si faltan datos, no se presenta un subtotal como coste total. */
  missingRateEmployeeIds: string[];
};

export function shiftDurationHours(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  if (![sh, sm, eh, em].every(Number.isFinite)) return 0;
  if (sh! < 0 || sh! > 23 || eh! < 0 || eh! > 23 || sm! < 0 || sm! > 59 || em! < 0 || em! > 59) return 0;
  const startM = sh! * 60 + sm!;
  let endM = eh! * 60 + em!;
  if (endM < startM) endM += 24 * 60;
  return Math.max(0, (endM - startM) / 60);
}

const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** La edición del día reemplaza las horas de ese día, no las añade a los fichajes. */
export function computeScheduleDayLaborCost(
  date: string,
  shifts: readonly ScheduleShiftForCost[],
  contexts: ScheduleLaborCostContext,
): ScheduleDayCostResult {
  let ordinaryCost = 0;
  let overtimeCost = 0;
  let ordinaryHours = 0;
  let overtimeHours = 0;
  let ordinaryIncomplete = false;
  let overtimeIncomplete = false;
  const missing = new Set<string>();
  const weekStart = mondayOnOrBefore(date);
  const byWorker = new Map<string, number>();

  for (const shift of shifts) {
    if (shift.active === false || !shift.start || !shift.end) continue;
    byWorker.set(shift.employeeId, (byWorker.get(shift.employeeId) ?? 0) + shiftDurationHours(shift.start, shift.end));
  }

  for (const [id, hours] of byWorker) {
    if (hours <= 0) continue;
    const context = contexts[id];
    if (!context) {
      missing.add(id);
      ordinaryIncomplete = true;
      overtimeIncomplete = true;
      continue;
    }

    const logs = Object.entries({ ...context.earlierHoursByDay, [date]: hours }).map(
      ([day, dailyHours]) => ({ clockInIso: `${day}T12:00:00Z`, totalHours: dailyHours }),
    );
    const breakdown = liquidateWeek({ employee: context.employee, weekStart, logs, isPaid: false, carryIn: 0 });
    const today = breakdown.dailyBreakdown.days.find((d) => d.day === date);
    if (!today) continue;
    ordinaryHours += today.ordinaryHours;
    overtimeHours += today.overtimeHours;

    if (today.ordinaryHours > 0) {
      if (context.ordinaryHourlyRate == null || !Number.isFinite(context.ordinaryHourlyRate)) {
        ordinaryIncomplete = true;
        missing.add(id);
      } else {
        ordinaryCost += today.ordinaryHours * context.ordinaryHourlyRate;
      }
    }
    if (today.overtimeHours > 0) {
      if (context.overtimeHourlyRate == null || !Number.isFinite(context.overtimeHourlyRate)) {
        overtimeIncomplete = true;
        missing.add(id);
      } else {
        overtimeCost += today.overtimeHours * context.overtimeHourlyRate;
      }
    }
  }

  return {
    ordinaryCost: ordinaryIncomplete ? null : money(ordinaryCost),
    overtimeCost: overtimeIncomplete ? null : money(overtimeCost),
    totalCost: ordinaryIncomplete || overtimeIncomplete ? null : money(ordinaryCost + overtimeCost),
    ordinaryHours,
    overtimeHours,
    missingRateEmployeeIds: [...missing],
  };
}

export function computeRequiredBilling(laborCost: number | null): number | null {
  if (laborCost == null) return null;
  if (laborCost <= 0) return 0;
  return money(laborCost / SCHEDULE_LABOR_TARGET_RATIO);
}

export function formatScheduleEuro(value: number | null): string {
  if (value == null) return '—';
  return `${new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} €`;
}
