/**
 * Detalle diario del coste laboral.
 *
 * Fijo: prorrateo contable por días naturales del coste realmente importado
 * de la gestoría, no sólo de trabajadores que hayan fichado ese día.
 * Extras: proyección semanal persistida, sin estimar importes pendientes.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PayrollAllocationService } from '../payroll/payroll-allocation-service.ts';
import type { ContractTermsService } from '../payroll/contract-terms-service.ts';
import type { PayrollFactRepository } from '../payroll/payroll-fact-repository.ts';
import { Money, Percentage } from '../payroll/value-objects.ts';
import type { LaborCostDayDTO, WorkerLaborCostDTO } from './labor-cost-dtos.ts';
import { loadOvertimeCostByDay } from './overtime-cost-from-projection.ts';
import { formatYmdInMadrid, madridRangeUtcIso } from '../madrid-date-bounds.ts';
import { filterVisiblePlantillaEmployees, PLANTILLA_EMPLOYEE_SELECT } from '../staff/plantilla-employees.ts';
import { allocatePayrollToNaturalDays } from '../hours-engine/payroll-ordinary-daily.ts';
import { resolveLaborWorkerDay } from './labor-worker-day.ts';

const LABOR_PROFILE_SELECT = `${PLANTILLA_EMPLOYEE_SELECT}, staffing_mode` as const;

export class LaborCostDayReadModelProjector {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly allocationService: PayrollAllocationService,
    private readonly contractTermsService: ContractTermsService,
    private readonly payrollRepo: PayrollFactRepository,
  ) {}

  async projectDayDetail(
    dateYmd: string,
    options?: { includeAllContracted?: boolean; userId?: string | null },
  ): Promise<LaborCostDayDTO> {
    const day = dateYmd.slice(0, 10);
    const periodYm = day.slice(0, 7);
    const includeAll = options?.includeAllContracted ?? false;
    const workerFilter = options?.userId ?? null;

    const [activeFacts, summaryResult, salesResult, profilesResult] = await Promise.all([
      this.payrollRepo.getActiveFactsForPeriod(periodYm),
      this.supabase.from('payroll_monthly_totals')
        .select('period_start, period_end, total_company_cost')
        .eq('period_ym', periodYm).maybeSingle(),
      this.supabase.from('cash_closings')
        .select('net_sales').eq('closing_date', day),
      this.supabase.from('profiles').select(LABOR_PROFILE_SELECT),
    ]);
    if (summaryResult.error) throw new Error(`payroll_monthly_totals: ${summaryResult.error.message}`);
    if (salesResult.error) throw new Error(`cash_closings: ${salesResult.error.message}`);
    if (profilesResult.error) throw new Error(`profiles: ${profilesResult.error.message}`);

    const summaryRow = summaryResult.data;
    const isPayrollPending = !summaryRow || summaryRow.total_company_cost == null;
    const periodStart = String(summaryRow?.period_start ?? `${periodYm}-01`).slice(0, 10);
    const periodEnd = String(summaryRow?.period_end ?? day).slice(0, 10);
    const netSalesMoney = Money.from((salesResult.data ?? [])
      .reduce((sum, row) => sum + Number(row.net_sales ?? 0), 0));

    // Conservar en el detalle a antiguos empleados con nómina aunque
    // ya no figuren como visibles en el selector de plantilla.
    const visible = filterVisiblePlantillaEmployees(profilesResult.data ?? []);
    const paidIds = new Set(activeFacts.map((fact) => fact.user_id));
    const profiles = [
      ...visible,
      ...(profilesResult.data ?? []).filter((p) =>
        paidIds.has(p.id) && !visible.some((v) => v.id === p.id)),
    ].filter((p) => !workerFilter || p.id === workerFilter);

    const monthlyCostByUser = new Map<string, number>();
    for (const fact of activeFacts) {
      monthlyCostByUser.set(fact.user_id,
        (monthlyCostByUser.get(fact.user_id) ?? 0) + Number(fact.total_company_cost));
    }
    const fixedByUser = new Map<string, Money>();
    if (!isPayrollPending) {
      for (const [userId, cost] of monthlyCostByUser) {
        fixedByUser.set(userId, Money.from(
          allocatePayrollToNaturalDays(cost, periodStart, periodEnd)[day] ?? 0,
        ));
      }
    }
    // Compensar sólo céntimos de redondeo entre reparto total y reparto
    // individual; diferencias reales deben permanecer visibles en conciliación.
    const officialDayFixed = isPayrollPending ? Money.zero() :
      Money.from(allocatePayrollToNaturalDays(
        Number(summaryRow!.total_company_cost), periodStart, periodEnd,
      )[day] ?? 0);
    if (!workerFilter && fixedByUser.size > 0) {
      const allocated = [...fixedByUser.values()]
        .reduce((sum, cost) => sum.add(cost), Money.zero());
      const remainder = officialDayFixed.subtract(allocated);
      if (Math.abs(remainder.amount) <= 0.05 && !remainder.isZero()) {
        const firstPaid = fixedByUser.keys().next().value as string;
        fixedByUser.set(firstPaid, fixedByUser.get(firstPaid)!.add(remainder));
      }
    }

    const profileIds = profiles.map((p) => p.id);
    const overtimeByUser = await loadOvertimeCostByDay(this.supabase, profileIds, day, day);
    const clockInUsers = new Set<string>();
    if (profileIds.length > 0) {
      const { startIso, endIso } = madridRangeUtcIso(day, day);
      const { data: logs, error: logsError } = await this.supabase
        .from('time_logs').select('user_id, clock_in')
        .in('user_id', profileIds)
        .gte('clock_in', startIso).lte('clock_in', endIso);
      if (logsError) throw new Error(`time_logs: ${logsError.message}`);
      for (const log of logs ?? []) {
        if (formatYmdInMadrid(log.clock_in) === day) {
          clockInUsers.add(String(log.user_id));
        }
      }
    }

    const contractStore = profileIds.length > 0
      ? await this.contractTermsService.loadTermsForMonth(profileIds, periodYm)
      : null;
    const workers: WorkerLaborCostDTO[] = [];
    let totalOvertime = Money.zero();
    for (const profile of profiles) {
      const fixed = fixedByUser.get(profile.id) ?? Money.zero();
      const overtime = Money.from(overtimeByUser.get(profile.id)?.get(day)?.overtimeCost ?? 0);
      const hasActivity = clockInUsers.has(profile.id) || !overtime.isZero();
      const hasActiveContract = contractStore
        ? contractStore.isContractActiveOn(profile.id, day) : false;
      const decision = resolveLaborWorkerDay({
        staffingMode: profile.staffing_mode,
        hasActivity,
        hasActiveContract,
        includeAllContracted: includeAll,
        fixed: fixed.amount,
        overtime: overtime.amount,
      });
      // Al mostrar todos, incluir también pagos a antiguos empleados, incluso
      // si su contrato ya no está activo hoy. No inventar una fila sintética.
      const include = decision.include || (includeAll && !fixed.isZero());
      if (!include) continue;
      const shownFixed = includeAll ? fixed : Money.from(decision.fixed);
      const shownOvertime = Money.from(decision.overtime);
      const total = shownFixed.add(shownOvertime);
      workers.push({
        id: profile.id,
        name: `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() || '—',
        fixed: shownFixed.amount,
        overtime: shownOvertime.amount,
        total: total.amount,
        laborPctOfSales: netSalesMoney.isZero()
          ? null : Percentage.fromValues(total, netSalesMoney).value,
        hasActivity,
        hasActiveContract,
        isEventual: !hasActiveContract && isPayrollPending,
      });
      totalOvertime = totalOvertime.add(shownOvertime);
    }

    const totalFixed = workerFilter
      ? fixedByUser.get(workerFilter) ?? Money.zero() : officialDayFixed;
    const totalCost = totalFixed.add(totalOvertime);
    const pctStatus = netSalesMoney.isZero() ? 'no_sales'
      : isPayrollPending ? 'incomplete_payroll_pending' : 'complete';

    return {
      dateYmd: day,
      netSales: netSalesMoney.amount,
      totalFixed: totalFixed.amount,
      totalOvertime: totalOvertime.amount,
      totalCost: totalCost.amount,
      laborPctOfSales: netSalesMoney.isZero()
        ? null : Percentage.fromValues(totalCost, netSalesMoney).value,
      isPayrollPending,
      pctStatus,
      workers,
      reconciliation: null,
    };
  }
}
