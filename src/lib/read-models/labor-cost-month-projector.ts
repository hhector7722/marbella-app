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
import { loadEmployeeBoundaryFacts, loadEmployeeBoundaryFactsBatch } from '../hours-engine/load-employee-facts.ts';
import {
  employeeTimelineStartWeek,
  isPaidLookupFromRows,
  bagModeOverrideLookupFromRows,
  resolveOpeningCarryIn,
} from '../hours-engine/opening-carry.ts';
import {
  hoursWindowBounds,
  listMondaysInclusive,
  overtimeMoneyByDayFromChain,
  resolveWindowOpeningCarry,
  WEEKLY_SNAPSHOT_WINDOW_SELECT,
  WEEKLY_SNAPSHOT_WINDOW_SELECT_WITH_USER,
} from '../hours-engine/window-hours-chain.ts';
import { mondayOnOrBefore } from '../hours-engine/week-dates.ts';
import type { CivilDate } from '../hours-engine/types.ts';
import { formatYmdInMadrid, madridRangeUtcIso } from '../madrid-date-bounds.ts';
import { filterVisiblePlantillaEmployees, PLANTILLA_EMPLOYEE_SELECT } from '../staff/plantilla-employees.ts';
import { computePeriodReconciliation } from '../payroll/payroll-reconciliation-service.ts';

function mondayOf(ymd: string): CivilDate {
  return mondayOnOrBefore(ymd.split('T')[0]! as CivilDate);
}

type HoursHistoryRows = {
  snapshots: Array<{
    week_start: string;
    is_paid: boolean | null;
    prefer_stock_hours_override: boolean | null;
    overtime_price_snapshot: number | null;
    pending_balance: number | null;
  }>;
  logs: Array<{
    clock_in: string;
    clock_out: string | null;
    total_hours: number | null;
  }>;
};

export class LaborCostMonthReadModelProjector {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly dayProjector: LaborCostDayReadModelProjector,
    private readonly payrollRepo: PayrollFactRepository,
    private readonly contractTermsService?: ContractTermsService,
  ) {}

  /**
   * Proyecta el calendario mensual ejecutando 1 SOLA carga por conjunto para contratos e histórico.
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

    // 5. Hechos de frontera para todos los empleados en dos consultas totales.
    let boundaryFactsByUser: Record<string, Awaited<ReturnType<typeof loadEmployeeBoundaryFactsBatch>>[string]> = {};
    let boundaryBatchFailed = false;
    if (workerIds.length > 0) {
      try {
        boundaryFactsByUser = await loadEmployeeBoundaryFactsBatch(this.supabase, workerIds);
      } catch {
        boundaryBatchFailed = true;
      }
    }

    // 6. Histórico corto de Hours Engine: semanas del mes + la anterior (arrastre).
    const hoursHistoryByUser = new Map<string, HoursHistoryRows>();
    let hoursHistoryBatchFailed = false;
    const firstWeekStart = mondayOf(startDate);
    const lastWeekStart = mondayOf(endDate);
    const weekStarts = listMondaysInclusive(firstWeekStart, lastWeekStart);
    const { logsFrom: windowFromYmd, lastSunday: weekEnd, snapsTo } = hoursWindowBounds(
      firstWeekStart,
      lastWeekStart,
    );

    if (workerIds.length > 0 && !boundaryBatchFailed) {
      try {
        const { startIso, endIso } = madridRangeUtcIso(windowFromYmd, weekEnd);
        const [snapsRes, logsRes] = await Promise.all([
          this.supabase
            .from('weekly_snapshots')
            .select(WEEKLY_SNAPSHOT_WINDOW_SELECT_WITH_USER)
            .in('user_id', workerIds)
            .gte('week_start', windowFromYmd)
            .lte('week_start', snapsTo),
          this.supabase
            .from('time_logs')
            .select('user_id, clock_in, clock_out, total_hours')
            .in('user_id', workerIds)
            .gte('clock_in', startIso)
            .lte('clock_in', endIso),
        ]);

        if (snapsRes.error || logsRes.error) {
          hoursHistoryBatchFailed = true;
        } else {
          for (const userId of workerIds) hoursHistoryByUser.set(userId, { snapshots: [], logs: [] });
          for (const row of snapsRes.data ?? []) {
            const bucket = hoursHistoryByUser.get(row.user_id);
            if (bucket) bucket.snapshots.push({
              week_start: row.week_start,
              is_paid: row.is_paid,
              prefer_stock_hours_override: row.prefer_stock_hours_override,
              overtime_price_snapshot: row.overtime_price_snapshot,
              pending_balance: row.pending_balance,
            });
          }
          for (const row of logsRes.data ?? []) {
            const bucket = hoursHistoryByUser.get(row.user_id);
            if (bucket) bucket.logs.push({
              clock_in: row.clock_in,
              clock_out: row.clock_out,
              total_hours: row.total_hours,
            });
          }
        }
      } catch {
        hoursHistoryBatchFailed = true;
      }
    } else if (workerIds.length > 0) {
      hoursHistoryBatchFailed = true;
    }

    // 7. Coste fijo diario por trabajador, completamente en memoria.
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

    await Promise.all(profiles.map(async (profile) => {
      workerDailyCosts[profile.id] = {};

      const contractActiveMap: Record<string, boolean> = {};
      for (const dayYmd of monthDays) {
        contractActiveMap[dayYmd] = contractStore ? contractStore.isContractActiveOn(profile.id, dayYmd) : false;
      }

      try {
        let employee = boundaryFactsByUser[profile.id];
        if (!employee) {
          employee = await loadEmployeeBoundaryFacts(this.supabase, profile.id);
          boundaryFactsByUser[profile.id] = employee;
        }

        const loadHours = async (fromYmd: string): Promise<HoursHistoryRows> => {
          const { startIso, endIso } = madridRangeUtcIso(fromYmd, weekEnd);
          const [snapsRes, logsRes] = await Promise.all([
            this.supabase
              .from('weekly_snapshots')
              .select(WEEKLY_SNAPSHOT_WINDOW_SELECT)
              .eq('user_id', profile.id)
              .gte('week_start', fromYmd)
              .lte('week_start', lastWeekStart),
            this.supabase
              .from('time_logs')
              .select('clock_in, clock_out, total_hours')
              .eq('user_id', profile.id)
              .gte('clock_in', startIso)
              .lte('clock_in', endIso),
          ]);
          if (snapsRes.error || logsRes.error) throw new Error('No se pudo cargar histórico de Hours Engine');
          return {
            snapshots: (snapsRes.data ?? []) as HoursHistoryRows['snapshots'],
            logs: (logsRes.data ?? []) as HoursHistoryRows['logs'],
          };
        };

        let snapsRows: HoursHistoryRows['snapshots'];
        let logRows: HoursHistoryRows['logs'];

        if (!hoursHistoryBatchFailed && hoursHistoryByUser.has(profile.id)) {
          const history = hoursHistoryByUser.get(profile.id)!;
          snapsRows = history.snapshots;
          logRows = history.logs;
        } else {
          const short = await loadHours(windowFromYmd);
          snapsRows = short.snapshots;
          logRows = short.logs;
        }

        let engineLogs = logRows.map((l) => ({
          clockInIso: l.clock_in as string,
          clockOutIso: l.clock_out as string | null,
          totalHours: l.total_hours as number | null,
        }));

        let opening = resolveWindowOpeningCarry({
          employee,
          firstWeekStart,
          snaps: snapsRows,
          logs: engineLogs,
        });

        if ('needsFullReplay' in opening) {
          const timelineStart = employeeTimelineStartWeek(employee);
          const fromYmd =
            timelineStart && timelineStart < firstWeekStart ? timelineStart : firstWeekStart;
          const full = await loadHours(fromYmd);
          snapsRows = full.snapshots;
          logRows = full.logs;
          engineLogs = logRows.map((l) => ({
            clockInIso: l.clock_in as string,
            clockOutIso: l.clock_out as string | null,
            totalHours: l.total_hours as number | null,
          }));
          opening = {
            carryIn: resolveOpeningCarryIn({
              employee,
              chainStart: firstWeekStart,
              logs: engineLogs,
              isPaidByWeek: isPaidLookupFromRows(snapsRows),
              bagModeOverrideByWeek: bagModeOverrideLookupFromRows(snapsRows),
            }),
          };
        }

        const overtimeByDay = overtimeMoneyByDayFromChain({
          employee,
          weekStarts,
          snaps: snapsRows,
          logs: engineLogs,
          openingCarryIn: opening.carryIn,
        });
        const clockInDays = new Set(engineLogs.map((l) => formatYmdInMadrid(l.clockInIso)));

        for (const dayYmd of monthDays) {
          const hasActiveContract = contractActiveMap[dayYmd] ?? false;
          const overtimeMoney = Money.from(overtimeByDay[dayYmd] ?? 0);
          const hasClockIns = clockInDays.has(dayYmd);
          const hasActivity = hasClockIns || !overtimeMoney.isZero();
          let fixedMoney = dailyFixedByWorker[profile.id] ?? Money.zero();
          if (!hasActiveContract && isPayrollPending) fixedMoney = Money.zero();
          workerDailyCosts[profile.id]![dayYmd] = { fixed: fixedMoney, overtime: overtimeMoney, hasActivity, hasActiveContract };
        }
      } catch {
        for (const dayYmd of monthDays) {
          workerDailyCosts[profile.id]![dayYmd] = {
            fixed: dailyFixedByWorker[profile.id] ?? Money.zero(),
            overtime: Money.zero(),
            hasActivity: false,
            hasActiveContract: contractActiveMap[dayYmd] ?? false,
          };
        }
      }
    }));

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
