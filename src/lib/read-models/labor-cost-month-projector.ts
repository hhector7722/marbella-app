/**
 * LaborCostMonthReadModelProjector (FASE 10 - Optimización Batch).
 *
 * Proyector encargado de construir el resumen mensual para el calendario del Dashboard.
 * Optimizado para ejecutar consultas en lote (Batch Processing) en lugar de bucles secuenciales N+1.
 * Pasa de ~3.720 peticiones HTTP a ~6 peticiones totales para todo el mes.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { addDays, format, parseISO } from 'date-fns';
import { ContractTermsService } from '../payroll/contract-terms-service.ts';
import type { LaborCostDayReadModelProjector } from './labor-cost-day-projector.ts';
import type { PayrollFactRepository } from '../payroll/payroll-fact-repository.ts';
import type { LaborCostMonthSummaryDTO } from './labor-cost-dtos.ts';
import { Money, Percentage } from '../payroll/value-objects.ts';
import { loadEmployeeBoundaryFacts } from '../hours-engine/load-employee-facts.ts';
import { liquidateWeekForCard } from '../hours-engine/week-card-from-liquidation.ts';
import {
  employeeTimelineStartWeek,
  isPaidLookupFromRows,
  bagModeOverrideLookupFromRows,
  overtimeRateOverrideLookupFromRows,
  resolveOpeningCarryIn,
} from '../hours-engine/opening-carry.ts';
import { formatYmdInMadrid, madridRangeUtcIso } from '../madrid-date-bounds.ts';
import {
  filterVisiblePlantillaEmployees,
  PLANTILLA_EMPLOYEE_SELECT,
} from '../staff/plantilla-employees.ts';

function mondayOf(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y!, m! - 1, d!);
  const dow = dt.getDay();
  const delta = dow === 0 ? -6 : 1 - dow;
  dt.setDate(dt.getDate() + delta);
  return format(dt, 'yyyy-MM-dd');
}

export class LaborCostMonthReadModelProjector {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly dayProjector: LaborCostDayReadModelProjector,
    private readonly payrollRepo: PayrollFactRepository,
    private readonly contractTermsService?: ContractTermsService,
  ) {}

  /**
   * Proyecta el calendario mensual con fijos, extras, totales y porcentajes por día mediante consultas batch.
   */
  async projectMonthSummary(
    periodYm: string,
    options?: { includeAllContracted?: boolean },
  ): Promise<LaborCostMonthSummaryDTO> {
    const monthDays = ContractTermsService.listMonthDays(periodYm);
    const startDate = monthDays[0]!;
    const endDate = monthDays[monthDays.length - 1]!;
    const includeAll = options?.includeAllContracted ?? false;

    // 1. Cargar hechos de nómina para el mes (Consulta Batch 1)
    const activeFacts = await this.payrollRepo.getActiveFactsForPeriod(periodYm);
    const isPayrollPending = activeFacts.length === 0;

    // Agrupar coste empresa por trabajador
    const companyCostByWorker: Record<string, number> = {};
    for (const fact of activeFacts) {
      companyCostByWorker[fact.user_id] =
        (companyCostByWorker[fact.user_id] ?? 0) + fact.total_company_cost;
    }

    // 2. Cargar ventas diarias netas (Consulta Batch 2)
    const { data: salesRows } = await this.supabase
      .from('daily_sales')
      .select('date, total_net_amount')
      .gte('date', startDate)
      .lte('date', endDate);

    const salesByDate: Record<string, Money> = {};
    for (const s of salesRows ?? []) {
      if (s.date && s.total_net_amount) {
        salesByDate[s.date] = Money.from(Number(s.total_net_amount));
      }
    }

    // 3. Cargar plantilla de trabajadores (Consulta Batch 3)
    const { data: profileRows } = await this.supabase
      .from('profiles')
      .select(PLANTILLA_EMPLOYEE_SELECT);
    const profiles = filterVisiblePlantillaEmployees(profileRows ?? []);

    // 4. Calcular días vigentes y coste fijo diario por trabajador en paralelo
    const dailyFixedByWorker: Record<string, Money> = {};
    if (!isPayrollPending && this.contractTermsService) {
      await Promise.all(
        profiles.map(async (p) => {
          const cost = companyCostByWorker[p.id] ?? 0;
          if (cost > 0) {
            const activeDays = await this.contractTermsService!.getActiveContractDays(
              p.id,
              periodYm,
            );
            if (activeDays > 0) {
              dailyFixedByWorker[p.id] = Money.from(cost).divide(activeDays);
            }
          }
        }),
      );
    }

    // 5. Procesar horas extras y contratos por trabajador en paralelo para todo el mes
    const workerDailyCosts: Record<
      string,
      Record<string, { fixed: Money; overtime: Money; hasActivity: boolean; hasActiveContract: boolean }>
    > = {};

    await Promise.all(
      profiles.map(async (profile) => {
        workerDailyCosts[profile.id] = {};

        // Cargar vigencia contractual en el mes
        const contractActiveMap: Record<string, boolean> = {};
        if (this.contractTermsService) {
          await Promise.all(
            monthDays.map(async (dayYmd) => {
              contractActiveMap[dayYmd] = await this.contractTermsService!.isContractActiveOn(
                profile.id,
                dayYmd,
              );
            }),
          );
        }

        // Cargar timelogs y snapshots para el mes
        try {
          const firstWeekStart = mondayOf(startDate);
          const lastWeekStart = mondayOf(endDate);
          const weekEnd = format(addDays(parseISO(lastWeekStart), 6), 'yyyy-MM-dd');

          const employee = await loadEmployeeBoundaryFacts(this.supabase, profile.id);
          const timelineStart = employeeTimelineStartWeek(employee);
          const logsFromYmd =
            timelineStart && timelineStart < firstWeekStart ? timelineStart : firstWeekStart;
          const { startIso, endIso } = madridRangeUtcIso(logsFromYmd, weekEnd);

          const [snapsRes, logsRes] = await Promise.all([
            this.supabase
              .from('weekly_snapshots')
              .select('week_start, is_paid, prefer_stock_hours_override, overtime_price_snapshot')
              .eq('user_id', profile.id)
              .gte('week_start', logsFromYmd)
              .lte('week_start', lastWeekStart),
            this.supabase
              .from('time_logs')
              .select('clock_in, clock_out, total_hours')
              .eq('user_id', profile.id)
              .gte('clock_in', startIso)
              .lte('clock_in', endIso),
          ]);

          const engineLogs = (logsRes.data ?? []).map((l: any) => ({
            clockInIso: l.clock_in as string,
            clockOutIso: l.clock_out as string | null,
            totalHours: l.total_hours as number | null,
          }));

          const isPaidByWeek = isPaidLookupFromRows(snapsRes.data ?? []);
          const bagModeOverrideByWeek = bagModeOverrideLookupFromRows(snapsRes.data ?? []);
          const overtimeRateOverrideByWeek = overtimeRateOverrideLookupFromRows(snapsRes.data ?? []);

          // Agrupar extras por día de todo el mes
          const overtimeByDay: Record<string, number> = {};
          const clockInDays = new Set(engineLogs.map((l) => formatYmdInMadrid(l.clockInIso)));

          let currentWeek = firstWeekStart;
          while (currentWeek <= lastWeekStart) {
            const cWeekEnd = format(addDays(parseISO(currentWeek), 6), 'yyyy-MM-dd');
            const carryIn = resolveOpeningCarryIn({
              employee,
              chainStart: currentWeek,
              logs: engineLogs,
              isPaidByWeek,
              bagModeOverrideByWeek,
            });

            const weekLogs = engineLogs.filter((l) => {
              const d = formatYmdInMadrid(l.clockInIso);
              return d >= currentWeek && d <= cWeekEnd;
            });

            const { extrasByDay, summary } = liquidateWeekForCard({
              employee,
              weekStart: currentWeek,
              logs: weekLogs,
              isPaid: isPaidByWeek(currentWeek),
              carryIn,
              bagModeOverride: bagModeOverrideByWeek(currentWeek),
              overrideRate: overtimeRateOverrideByWeek(currentWeek),
            });

            if (summary.estimatedValue > 0) {
              for (const [d, ot] of Object.entries(extrasByDay)) {
                if (ot > 0) overtimeByDay[d] = (overtimeByDay[d] ?? 0) + ot;
              }
            }

            currentWeek = format(addDays(parseISO(currentWeek), 7), 'yyyy-MM-dd');
          }

          for (const dayYmd of monthDays) {
            const hasActiveContract = contractActiveMap[dayYmd] ?? false;
            const otAmount = overtimeByDay[dayYmd] ?? 0;
            const overtimeMoney = Money.from(otAmount);
            const hasClockIns = clockInDays.has(dayYmd);
            const hasActivity = hasClockIns || !overtimeMoney.isZero();
            let fixedMoney = dailyFixedByWorker[profile.id] ?? Money.zero();

            if (!hasActiveContract && isPayrollPending) {
              fixedMoney = Money.zero();
            }

            workerDailyCosts[profile.id]![dayYmd] = {
              fixed: fixedMoney,
              overtime: overtimeMoney,
              hasActivity,
              hasActiveContract,
            };
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
      }),
    );

    // 6. Construir DTO final indexando en memoria sin ninguna consulta HTTP
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

        const shouldInclude = includeAll
          ? workerData.hasActiveContract || workerData.hasActivity
          : workerData.hasActivity;

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

    return {
      periodYm,
      byDate,
      totalFixed: totalFixedMoney.amount,
      totalOvertime: totalOvertimeMoney.amount,
      totalCost: totalCostMoney.amount,
      isPayrollPending,
      missingPayrollMonths: isPayrollPending ? [periodYm] : [],
    };
  }
}
