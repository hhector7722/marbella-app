/**
 * Reparto OPERATIVO de la nómina oficial: solo se genera coste en jornadas fichadas.
 *
 * Las horas ordinarias se valoran con la nómina individual de empresa dividida
 * entre las horas contractuales del periodo. Las horas extra usan exclusivamente
 * el importe diario ya persistido por el Writer en weekly_snapshot_days.
 *
 * Solo falta un coste si hay horas ordinarias sin nómina/términos positivos,
 * o extras sin proyección verificable. Sin resumen mensual oficial el periodo
 * permanece pendiente. Nunca se inventa una tarifa ni se rehacen las extras.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { ContractTermsService } from '../payroll/contract-terms-service.ts';
import { formatYmdInMadrid, madridRangeUtcIso } from '../madrid-date-bounds.ts';
import type { EmployeePayrollFactRow } from '../../types/payroll-facts.ts';

type Term = { user_id: string; effective_from: string; effective_to: string | null; weekly_hours: number | string | null };
type Log = { user_id: string; clock_in: string; clock_out: string | null; total_hours: number | string | null };
type ExtraHours = {
  user_id: string;
  day: string;
  week_start?: string;
  overtime_hours: number | string | null;
  overtime_cost?: number | string | null;
};
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
  missingRateWeeks?: ReadonlySet<string>;
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
  // La proyección persistida del motor de horas es la única fuente del coste
  // de extras. Un coste cero es válido si la semana no tiene tarifa pendiente.
  const overtimeByDay = new Map<string, Map<string, { hours: number; cost: number; known: boolean }>>();
  for (const extra of input.extraHours) {
    if (input.workerFilter && input.workerFilter !== extra.user_id) continue;
    if (!overtimeByDay.has(extra.day)) overtimeByDay.set(extra.day, new Map());
    const byUser = overtimeByDay.get(extra.day)!;
    const previous = byUser.get(extra.user_id);
    const hours = Math.max(0, Number(extra.overtime_hours) || 0);
    const rawCost = extra.overtime_cost == null ? null : Number(extra.overtime_cost);
    const known = rawCost !== null && Number.isFinite(rawCost) && rawCost >= 0
      && !input.missingRateWeeks?.has(`${extra.user_id}:${extra.week_start ?? ''}`);
    byUser.set(extra.user_id, {
      hours: (previous?.hours ?? 0) + hours,
      cost: (previous?.cost ?? 0) + (known ? rawCost : 0),
      known: (previous?.known ?? true) && known,
    });
  }

  const result: OperationalMonth = {};
  for (const day of input.days) {
    const workers: OperationalWorkerDay[] = [];
    let fixed = 0, overtime = 0, missingWorkers = 0;
    for (const [userId, hours] of hoursByDay.get(day) ?? []) {
      const hourly = hourlyCost.get(userId);
      const extra = overtimeByDay.get(day)?.get(userId);
      const extraH = Math.min(hours, extra?.hours ?? 0);
      const ordinaryH = Math.max(0, hours - extraH);
      const ordinaryKnown = ordinaryH < 0.001 || hourly !== undefined;
      const overtimeKnown = extraH < 0.001 || extra?.known === true;
      const costKnown = !input.payrollPending && ordinaryKnown && overtimeKnown;
      const ordinaryCost = !input.payrollPending && ordinaryKnown && hourly !== undefined
        ? cents(ordinaryH * hourly) : 0;
      const overtimeCost = !input.payrollPending && overtimeKnown
        ? cents(extra?.cost ?? 0) : 0;
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
  const [termsRes, logsRes, overtimeRes, weeklyRes] = await Promise.all([
    supabase.from('hours_contract_terms')
      .select('user_id,effective_from,effective_to,weekly_hours')
      .lte('effective_from', last),
    supabase.from('time_logs')
      .select('user_id,clock_in,clock_out,total_hours')
      .gte('clock_in', bounds.startIso)
      .lte('clock_in', bounds.endIso),
    supabase.from('weekly_snapshot_days')
      .select('user_id,day,week_start,overtime_hours,overtime_cost')
      .gte('day', first).lte('day', last),
    supabase.from('weekly_snapshots')
      .select('user_id,week_start,has_missing_rate')
      .lte('week_start', last).gte('week_end', first),
  ]);
  if (termsRes.error) throw new Error('hours_contract_terms: ' + termsRes.error.message);
  if (logsRes.error) throw new Error('time_logs: ' + logsRes.error.message);
  if (overtimeRes.error) throw new Error('weekly_snapshot_days: ' + overtimeRes.error.message);
  if (weeklyRes.error) throw new Error('weekly_snapshots: ' + weeklyRes.error.message);
  const missingRateWeeks = new Set(
    (weeklyRes.data ?? [])
      .filter(row => row.has_missing_rate)
      .map(row => `${row.user_id}:${row.week_start}`),
  );
  return allocateOperationalMonth({
    days,
    periodStart,
    periodEnd,
    facts,
    terms: (termsRes.data ?? []) as Term[],
    logs: (logsRes.data ?? []) as Log[],
    extraHours: (overtimeRes.data ?? []) as ExtraHours[],
    missingRateWeeks,
    payrollPending,
    workerFilter,
  });
}
