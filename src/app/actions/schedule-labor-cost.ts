'use server';

import { createClient } from '@/utils/supabase/server';
import { isMasterDashboardUser } from '@/lib/master-dashboard';
import { loadEmployeeBoundaryFactsBatch } from '@/lib/hours-engine/load-employee-facts';
import { rateFromEmployeePayroll, overtimeRateForScheduleDay, mostCommonCompanyHourlyRate, versionedOvertimeRateForDay, resolveOrdinaryScheduleHourlyRate, type CompanyPayrollFact } from '@/lib/schedule-payroll-rate';
import { mondayOnOrBefore } from '@/lib/hours-engine/week-dates';
import { formatYmdInMadrid, madridRangeUtcIso } from '@/lib/madrid-date-bounds';
import { roundMarbellaHours } from '@/lib/hours-engine/marbella-round';
import type { ScheduleLaborCostContext } from '@/lib/schedule-day-profitability';

type PayrollRow = CompanyPayrollFact;
type HistoricalOvertimeRateRow = { user_id: string; valid_from: string; valid_to: string | null; overtime_cost_per_hour: number | string | null };
type ShiftRow = {
  user_id: string;
  start_time: string;
  end_time: string;
  draft_start_time: string | null;
  draft_end_time: string | null;
  created_at: string | null;
};
type LogRow = { user_id: string; clock_in: string; clock_out: string | null; total_hours: number | null };

function monthBefore(ym: string): string {
  const [year, month] = ym.split('-').map(Number);
  const previous = new Date(Date.UTC(year!, month! - 2, 1));
  return `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, '0')}`;
}

function loggedHours(row: LogRow): number {
  if (row.total_hours != null && Number.isFinite(Number(row.total_hours))) {
    return Number(row.total_hours);
  }
  if (!row.clock_out) return 0;
  const hours = (new Date(row.clock_out).getTime() - new Date(row.clock_in).getTime()) / 3_600_000;
  return Number.isFinite(hours) && hours > 0 ? roundMarbellaHours(hours) : 0;
}

/**
 * Una lectura en lote por fuente, solo para usuario master. No publica datos
 * salariales a roles de empleados, ni persiste modificaciones.
 * Para planificación futura se toma la última nómina de un mes CERRADO.
 */
export async function getScheduleLaborCostContext(
  day: string,
  employeeIds: string[],
): Promise<{ success: true; data: ScheduleLaborCostContext } | { success: false; error: string }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(`${day}T12:00:00Z`))) {
    return { success: false, error: 'Fecha inválida' };
  }
  const ids = [...new Set(employeeIds)].filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  if (ids.length !== employeeIds.length || ids.length > 80) {
    return { success: false, error: 'Trabajadores inválidos' };
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!isMasterDashboardUser(user?.email)) return { success: false, error: 'Acceso denegado' };
  if (!ids.length) return { success: true, data: {} };

  try {
    const weekStart = mondayOnOrBefore(day);
    const currentMonth = formatYmdInMadrid(new Date()).slice(0, 7);
    const latestCompleteMonth = monthBefore(currentMonth);
    const upperPayrollMonth = day.slice(0, 7) < currentMonth ? day.slice(0, 7) : latestCompleteMonth;
    let earliestPayrollMonth = upperPayrollMonth;
    for (let i = 0; i < 12; i++) earliestPayrollMonth = monthBefore(earliestPayrollMonth);
    const { startIso, endIso } = madridRangeUtcIso(weekStart, day);

    const [payrollRes, shiftsRes, logsRes, weeklyRes, historicalOtRes] = await Promise.all([
      supabase.from('employee_payroll_facts')
        .select('user_id, period_ym, total_company_cost')
        .eq('status', 'active').eq('settlement_type', 'ordinary')
        .gte('period_ym', earliestPayrollMonth).lte('period_ym', upperPayrollMonth)
        .order('period_ym', { ascending: false }),
      supabase.from('shifts')
        .select('user_id, start_time, end_time, draft_start_time, draft_end_time, created_at')
        .in('user_id', ids).gte('start_time', startIso).lte('start_time', endIso)
        .order('created_at', { ascending: false }),
      supabase.from('time_logs')
        .select('user_id, clock_in, clock_out, total_hours')
        .in('user_id', ids).gte('clock_in', startIso).lte('clock_in', endIso),
      supabase.from('weekly_snapshots')
        .select('user_id, overtime_price_snapshot')
        .in('user_id', ids).eq('week_start', weekStart),
      supabase.from('profile_labor_cost_terms')
        .select('user_id, valid_from, valid_to, overtime_cost_per_hour')
        .in('user_id', ids).lte('valid_from', day),
    ]);
    for (const [name, error] of [
      ['nóminas', payrollRes.error], ['turnos', shiftsRes.error],
      ['fichajes', logsRes.error], ['condiciones semanales', weeklyRes.error],
      ['tarifas históricas', historicalOtRes.error],
    ] as const) {
      if (error) throw new Error(`${name}: ${error.message}`);
    }

    const companyPayrollFacts = (payrollRes.data ?? []) as PayrollRow[];
    const donorIds = [...new Set([...ids, ...companyPayrollFacts.map(p => p.user_id)])];
    // Un único lote de tramos contractuales para los turnos y los empleados de referencia.
    const employees = await loadEmployeeBoundaryFactsBatch(supabase, donorIds);
    const commonHourlyCost = mostCommonCompanyHourlyRate(companyPayrollFacts, employees);
    const payrollByWorker = new Map<string, PayrollRow[]>();
    for (const fact of companyPayrollFacts) {
      const rows = payrollByWorker.get(fact.user_id) ?? [];
      rows.push(fact);
      payrollByWorker.set(fact.user_id, rows);
    }

    const earlier = new Map<string, Record<string, number>>();
    for (const id of ids) earlier.set(id, {});
    // Borradores y publicados: quedarse con el turno de creación más reciente.
    const seen = new Set<string>();
    for (const shift of (shiftsRes.data ?? []) as ShiftRow[]) {
      const start = shift.draft_start_time || shift.start_time;
      const end = shift.draft_end_time || shift.end_time;
      const shiftDay = formatYmdInMadrid(start);
      if (shiftDay >= day || shiftDay < weekStart) continue;
      const key = `${shift.user_id}:${shiftDay}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const hours = (new Date(end).getTime() - new Date(start).getTime()) / 3_600_000;
      if (Number.isFinite(hours) && hours > 0) {
        earlier.get(shift.user_id)![shiftDay] = hours;
      }
    }

    // Los fichajes realizados tienen prioridad sobre turnos previstos anteriores.
    const actual = new Map<string, Record<string, number>>();
    for (const log of (logsRes.data ?? []) as LogRow[]) {
      const logDay = formatYmdInMadrid(log.clock_in);
      if (logDay >= day || logDay < weekStart) continue;
      const hours = loggedHours(log);
      if (hours <= 0) continue;
      if (!actual.has(log.user_id)) actual.set(log.user_id, {});
      const worker = actual.get(log.user_id)!;
      worker[logDay] = (worker[logDay] ?? 0) + hours;
    }
    for (const [id, days] of actual) {
      Object.assign(earlier.get(id)!, days);
    }

    const overrides = new Map(
      (weeklyRes.data ?? []).map((row) => [row.user_id, row.overtime_price_snapshot]),
    );

    const overtimeTerms = new Map<string, HistoricalOvertimeRateRow[]>();
    for (const term of (historicalOtRes.data ?? []) as HistoricalOvertimeRateRow[]) {
      const list = overtimeTerms.get(term.user_id) ?? [];
      list.push(term);
      overtimeTerms.set(term.user_id, list);
    }

    const result: ScheduleLaborCostContext = {};
    for (const id of ids) {
      const employee = employees[id]!;
      const rate = rateFromEmployeePayroll(employee, payrollByWorker.get(id) ?? []);
      const activeContract = employee.terms.some(t => t.weeklyHours > 0 &&
        t.effectiveFrom <= day && (t.effectiveTo == null || t.effectiveTo >= day));
      // Una nómina no utilizable (ausente, ambigua o sin divisor contractual)
      // no debe dejar sin total el horario: si hay contrato activo, tomar la
      // referencia horaria empresarial. Nunca sustituir una nómina individual válida.
      const ordinaryHourlyRate = resolveOrdinaryScheduleHourlyRate(
        rate.rate, activeContract, commonHourlyCost?.rate ?? null,
      );
      const usedCompanyFallback = rate.rate == null && ordinaryHourlyRate != null;
      const override = overrides.get(id);
      const effectiveOverride = override == null ? undefined : Number(override);
      const contractualOtRate = overtimeRateForScheduleDay(employee, day, effectiveOverride);
      const overtimeHourlyRate = contractualOtRate ?? versionedOvertimeRateForDay(
        overtimeTerms.get(id) ?? [], day);
      result[id] = {
        employee,
        ordinaryHourlyRate,
        overtimeHourlyRate,
        earlierHoursByDay: earlier.get(id) ?? {},
        payrollPeriod: usedCompanyFallback ? commonHourlyCost?.period ?? null : rate.period,
      };
    }
    return { success: true, data: result };
  } catch (error) {
    console.error('[schedule-labor-cost]', error);
    return { success: false, error: 'No se pudo obtener el coste laboral verificable' };
  }
}
