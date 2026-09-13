/**
 * LaborCostMonthReadModelProjector (FASE 10 - Corrección Batch Loading Definitiva).
 *
 * Proyector encargado de construir el resumen mensual para el calendario del Dashboard.
 * Cumple estrictamente la regla de 1 ÚNICA consulta SQL a `hours_contract_terms` por mes.
 * Incorpora conciliación contable puramente informativa (computePeriodReconciliation).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { ContractTermsService, type ContractTermsStore } from '../payroll/contract-terms-service.ts';
import type { LaborCostDayReadModelProjector } from './labor-cost-day-projector.ts';
import type { PayrollFactRepository } from '../payroll/payroll-fact-repository.ts';
import type { LaborCostMonthSummaryDTO } from './labor-cost-dtos.ts';
import { Money, Percentage } from '../payroll/value-objects.ts';
import { loadOvertimeCostByDay } from './overtime-cost-from-projection.ts';
import { formatYmdInMadrid, madridRangeUtcIso } from '../madrid-date-bounds.ts';
import { filterVisiblePlantillaEmployees, PLANTILLA_EMPLOYEE_SELECT } from '../staff/plantilla-employees.ts';
import { computePeriodReconciliation } from '../payroll/payroll-reconciliation-service.ts';

export class LaborCostMonthReadModelProjector {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly dayProjector: LaborCostDayReadModelProjector,
    private readonly payrollRepo: PayrollFactRepository,
    private readonly contractTermsService?: ContractTermsService,
  ) {}

  /**
   * Proyecta el calendario mensual: contratos, proyección diaria persistida y nómina.
   */
  async projectMonthSummary(
    periodYm: string,
    options?: { includeAllContracted?: boolean },
  ): Promise<LaborCostMonthSummaryDTO> {
    const monthDays = ContractTermsService.listMonthDays(periodYm);
    const startDate = monthDays[0]!;
    const endDate = monthDays[monthDays.length - 1]!;
    const includeAll = options?.includeAllContracted ?? false;

    // 1. Nóminas activas del mes.
    const activeFacts = await this.payrollRepo.getActiveFactsForPeriod(periodYm);

    // Resumen oficial gestoría para conciliación informativa.
    let summaryCost: number | null = null;
    try {
      const { data: summaryRow } = await this.supabase
        .from('payroll_monthly_totals')
        .select('total_company_cost')
        .eq('period_ym', periodYm)
        .maybeSingle();
      if (summaryRow?.total_company_cost != null) summaryCost = Number(summaryRow.total_company_cost);
    } catch {
      summaryCost = null;
    }

    const reconciliation = computePeriodReconciliation({ summaryCost, activeFacts });
    const isPayrollPending = summaryCost === null;

    const companyCostByWorker: Record<string, number> = {};
    for (const fact of activeFacts) {
      companyCostByWorker[fact.user_id] = (companyCostByWorker[fact.user_id] ?? 0) + fact.total_company_cost;
    }

    // 2. Ventas diarias netas.
    const { data: salesRows } = await this.supabase
      .from('daily_sales')
      .select('date, total_net_amount')
      .gte('date', startDate)
      .lte('date', endDate);

    const salesByDate: Record<string, Money> = {};
    for (const s of salesRows ?? []) {
      if (s.date && s.total_net_amount) salesByDate[s.date] = Money.from(Number(s.total_net_amount));
    }

    // 3. Plantilla.
    const { data: profileRows } = await this.supabase
      .from('profiles')
      .select(PLANTILLA_EMPLOYEE_SELECT);
    const profiles = filterVisiblePlantillaEmployees(profileRows ?? []);
    const workerIds = profiles.map((p) => p.id);

    // 4. Tramos contractuales en una sola consulta por mes.
    let contractStore: ContractTermsStore | null = null;
    if (this.contractTermsService) {
      contractStore = await this.contractTermsService.loadTermsForMonth(workerIds, periodYm);
    }

    // 5. Extra diario persistido + fichajes del mes (sin Hours Engine).
    const overtimeByUser = await loadOvertimeCostByDay(this.supabase, workerIds, startDate, endDate);
    const clockInDaysByUser = new Map<string, Set<string>>();
    if (workerIds.length > 0) {
      const { startIso, endIso } = madridRangeUtcIso(startDate, endDate);
      const { data: logRows, error: logsErr } = await this.supabase
        .from('time_logs')
        .select('user_id, clock_in')
        .in('user_id', workerIds)
        .gte('clock_in', startIso)
        .lte('clock_in', endIso);
      if (logsErr) {
        throw new Error(`time_logs: ${logsErr.message}`);
      }
      for (const row of logRows ?? []) {
        const userId = String(row.user_id);
        const day = formatYmdInMadrid(row.clock_in);
        if (day < startDate || day > endDate) continue;
        let days = clockInDaysByUser.get(userId);
        if (!days) {
          days = new Set();
          clockInDaysByUser.set(userId, days);
        }
        days.add(day);
      }
    }

    // 6. Coste fijo diario por trabajador, completamente en memoria.
    const dailyFixedByWorker: Record<string, Money> = {};
    if (!isPayrollPending && contractStore) {
      for (const p of profiles) {
        const cost = companyCostByWorker[p.id] ?? 0;
        if (cost > 0) {
          const activeDays = contractStore.getActiveContractDays(p.id, periodYm);
          if (activeDays > 0) dailyFixedByWorker[p.id] = Money.from(cost).divide(activeDays);
        }
      }
    }

    const workerDailyCosts: Record<string, Record<string, { fixed: Money; overtime: Money; hasActivity: boolean; hasActiveContract: boolean }>> = {};

    for (const profile of profiles) {
      workerDailyCosts[profile.id] = {};
      const clockInDays = clockInDaysByUser.get(profile.id) ?? new Set<string>();
      const overtimeDays = overtimeByUser.get(profile.id);

      for (const dayYmd of monthDays) {
        const hasActiveContract = contractStore
          ? contractStore.isContractActiveOn(profile.id, dayYmd)
          : false;
        const overtimeMoney = Money.from(overtimeDays?.get(dayYmd)?.overtimeCost ?? 0);
        const hasClockIns = clockInDays.has(dayYmd);
        const hasActivity = hasClockIns || !overtimeMoney.isZero();
        let fixedMoney = dailyFixedByWorker[profile.id] ?? Money.zero();
        if (!hasActiveContract && isPayrollPending) fixedMoney = Money.zero();
        workerDailyCosts[profile.id]![dayYmd] = {
          fixed: fixedMoney,
          overtime: overtimeMoney,
          hasActivity,
          hasActiveContract,
        };
      }
    }

    // 8. Construir DTO final en memoria.
    const byDate: LaborCostMonthSummaryDTO['byDate'] = {};
    let totalFixedMoney = Money.zero();
    let totalOvertimeMoney = Money.zero();

    for (const dayYmd of monthDays) {
      const netSalesMoney = salesByDate[dayYmd] ?? Money.zero();
      let dayFixed = Money.zero();
      let dayOvertime = Money.zero();
      for (const profile of profiles) {
        const workerData = workerDailyCosts[profile.id]?.[dayYmd];
        if (!workerData) continue;
        const shouldInclude = includeAll ? workerData.hasActiveContract || workerData.hasActivity : workerData.hasActivity;
        if (shouldInclude) {
          dayFixed = dayFixed.add(workerData.fixed);
          dayOvertime = dayOvertime.add(workerData.overtime);
        }
      }
      const dayTotal = dayFixed.add(dayOvertime);
      const dayPct = Percentage.fromValues(dayTotal, netSalesMoney);
      byDate[dayYmd] = {
        totalCost: dayTotal.amount,
        totalFixed: dayFixed.amount,
        totalOvertime: dayOvertime.amount,
        total: dayTotal.amount,
        fixed: dayFixed.amount,
        overtime: dayOvertime.amount,
        laborPctOfSales: netSalesMoney.isZero() ? null : dayPct.value,
      };
      totalFixedMoney = totalFixedMoney.add(dayFixed);
      totalOvertimeMoney = totalOvertimeMoney.add(dayOvertime);
    }

    const totalCostMoney = totalFixedMoney.add(totalOvertimeMoney);
    const headerFixed = summaryCost !== null ? summaryCost : totalFixedMoney.amount;
    const headerOvertime = totalOvertimeMoney.amount;
    const headerCost = Money.from(headerFixed).add(Money.from(headerOvertime)).amount;

    return {
      periodYm,
      byDate,
      totalFixed: headerFixed,
      totalOvertime: headerOvertime,
      totalCost: headerCost,
      isPayrollPending,
      missingPayrollMonths: isPayrollPending ? [periodYm] : [],
      reconciliation,
    };
  }
}
