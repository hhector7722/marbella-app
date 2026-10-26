/**
 * Reparto OPERATIVO de la nómina oficial: solo se genera coste en jornadas fichadas.
 *
 * Tarifa/h de cada persona = coste de empresa de su nómina / horas contractuales
 * proporcionales a los días de alta del mes. Nunca se usa el coste diario
 * contable como sustituto de una jornada trabajada.
 *
 * Si faltan ficha, términos >0 o nómina individual, el coste diario se marca
 * incompleto (no se presenta un porcentaje falsamente favorable).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { ContractTermsService } from '../payroll/contract-terms-service.ts';
import { formatYmdInMadrid, madridRangeUtcIso } from '../madrid-date-bounds.ts';
import type { EmployeePayrollFactRow } from '../../types/payroll-facts.ts';

type Term = { user_id: string; effective_from: string; effective_to: string | null; weekly_hours: number | string | null };
type Log = { user_id: string; clock_in: string; clock_out: string | null; total_hours: number | string | null };
type ExtraHours = { user_id: string; day: string; overtime_hours: number | string | null };
export type OperationalWorkerDay = {
  userId: string;
  hours: number;
  ordinaryCost: number;
  overtimeCost: number;
  costKnown: boolean;
};
export type OperationalDay = {
  fixed: number;
  overtime: number;
  total: number;
  hasWorked: boolean;
  incomplete: boolean;
  missingWorkers: number;
  workers: OperationalWorkerDay[];
};
export type OperationalMonth = Record<string, OperationalDay>;

const cents = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function expectedContractHours(days: readonly string[], terms: readonly Term[], userId: string): number {
  let total = 0;
  const own = terms.filter(t => t.user_id === userId);
  for (const date of days) {
    const term = own.filter(t =>
      String(t.effective_from).slice(0, 10) <= date &&
      String(t.effective_to ?? '9999-12-31').slice(0, 10) >= date
    ).sort((a, b) => String(b.effective_from).localeCompare(String(a.effective_from)))[0];
    const weekly = Number(term?.weekly_hours ?? 0);
    if (weekly > 0 && Number.isFinite(weekly)) total += weekly / 7;
  }
  return total;
}

export function actualHours(log: Log): number {
  const stored = log.total_hours == null ? null : Number(log.total_hours);
  if (stored !== null && Number.isFinite(stored) && stored >= 0) return Math.min(24, stored);
  if (!log.clock_out) return 0;
  const hours = (new Date(log.clock_out).getTime() - new Date(log.clock_in).getTime()) / 3_600_000;
  return Number.isFinite(hours) && hours > 0 && hours <= 24 ? hours : 0;
}

export function allocateOperationalMonth(input: {
  days: readonly string[];
  periodStart: string;
  periodEnd: string;
  facts: readonly Pick<EmployeePayrollFactRow, 'user_id' | 'total_company_cost'>[];
  terms: readonly Term[];
  logs: readonly Log[];
  extraHours: readonly ExtraHours[];
  payrollPending: boolean;
  workerFilter?: string | null;
}): OperationalMonth {
  const byUserCost = new Map<string, number>();
  for (const fact of input.facts) {
    byUserCost.set(fact.user_id, (byUserCost.get(fact.user_id) ?? 0) + Number(fact.total_company_cost));
  }
  const relevantDays = input.days.filter(d => d >= input.periodStart && d <= input.periodEnd);
  const hourlyCost = new Map<string, number>();
  for (const [id, cost] of byUserCost) {
    const expected = expectedContractHours(relevantDays, input.terms, id);
    if (expected > 0 && Number.isFinite(cost) && cost >= 0) hourlyCost.set(id, cost / expected);
  }

  const hoursByDay = new Map<string, Map<string, number>>();
  for (const log of input.logs) {
    if (input.workerFilter && input.workerFilter !== log.user_id) continue;
    const day = formatYmdInMadrid(log.clock_in);
    if (!day || !input.days.includes(day)) continue;
    const hours = actualHours(log);
    if (hours <= 0) continue;
    if (!hoursByDay.has(day)) hoursByDay.set(day, new Map());
    const byUser = hoursByDay.get(day)!;
    byUser.set(log.user_id, (byUser.get(log.user_id) ?? 0) + hours);
  }
  const overtimeByDay = new Map<string, Map<string, number>>();
  for (const extra of input.extraHours) {
    if (input.workerFilter && input.workerFilter !== extra.user_id) continue;
    if (!overtimeByDay.has(extra.day)) overtimeByDay.set(extra.day, new Map());
    const byUser = overtimeByDay.get(extra.day)!;
    byUser.set(extra.user_id, (byUser.get(extra.user_id) ?? 0) + Math.max(0, Number(extra.overtime_hours) || 0));
  }

  const result: OperationalMonth = {};
  for (const day of input.days) {
    const workers: OperationalWorkerDay[] = [];
    let fixed = 0, overtime = 0, missingWorkers = 0;
    for (const [userId, hours] of hoursByDay.get(day) ?? []) {
      const hourly = hourlyCost.get(userId);
      const costKnown = !input.payrollPending && hourly !== undefined;
      const extraH = Math.min(hours, overtimeByDay.get(day)?.get(userId) ?? 0);
      const ordinaryCost = costKnown ? cents((hours - extraH) * hourly!) : 0;
      const overtimeCost = costKnown ? cents(extraH * hourly!) : 0;
      if (!costKnown) missingWorkers++;
      fixed += ordinaryCost;
      overtime += overtimeCost;
      workers.push({ userId, hours: cents(hours), ordinaryCost, overtimeCost, costKnown });
    }
    result[day] = {
      fixed: cents(fixed),
      overtime: cents(overtime),
      total: cents(fixed + overtime),
      hasWorked: workers.length > 0,
      incomplete: input.payrollPending || missingWorkers > 0 || workers.length === 0,
      missingWorkers,
      workers,
    };
  }
  return result;
}

export async function loadOperationalMonth(
  supabase: SupabaseClient,
  periodYm: string,
  facts: readonly EmployeePayrollFactRow[],
  periodStart: string,
  periodEnd: string,
  payrollPending: boolean,
  workerFilter?: string | null,
): Promise<OperationalMonth> {
  const days = ContractTermsService.listMonthDays(periodYm);
  if (!days.length) return {};
  const first = days[0]!;
  const last = days[days.length - 1]!;
  const bounds = madridRangeUtcIso(first, last);
  const [termsRes, logsRes, overtimeRes] = await Promise.all([
    supabase.from('hours_contract_terms')
      .select('user_id,effective_from,effective_to,weekly_hours')
      .lte('effective_from', last),
    supabase.from('time_logs')
      .select('user_id,clock_in,clock_out,total_hours')
      .gte('clock_in', bounds.startIso)
      .lte('clock_in', bounds.endIso),
    supabase.from('weekly_snapshot_days')
      .select('user_id,day,overtime_hours')
      .gte('day', first).lte('day', last),
  ]);
  if (termsRes.error) throw new Error('hours_contract_terms: ' + termsRes.error.message);
  if (logsRes.error) throw new Error('time_logs: ' + logsRes.error.message);
  if (overtimeRes.error) throw new Error('weekly_snapshot_days: ' + overtimeRes.error.message);
  return allocateOperationalMonth({
    days,
    periodStart,
    periodEnd,
    facts,
    terms: (termsRes.data ?? []) as Term[],
    logs: (logsRes.data ?? []) as Log[],
    extraHours: (overtimeRes.data ?? []) as ExtraHours[],
    payrollPending,
    workerFilter,
  });
}
