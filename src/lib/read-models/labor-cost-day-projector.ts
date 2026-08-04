/**
 * LaborCostDayReadModelProjector (FASE 4).
 *
 * Proyector de lectura encargado de construir el DTO inmutable del detalle diario (`LaborCostDayDTO`).
 *
 * Consume exclusivamente:
 * - PayrollAllocationService (Payroll Domain)
 * - ContractTermsService (Contracts SSOT)
 * - Hours Engine (liquidateWeekForCard -> extras)
 * - Ventas (daily_sales / ticket_sales)
 *
 * REGLAS INVIOLABLES:
 * 1. NUNCA incluye la fila sintética "Nómina empresa". Desaparece al 100%.
 * 2. Toggle OFF: Filtra únicamente trabajadores con actividad real (fichajes > 0 u extras > 0). Resumen = suma exclusiva de los visibles.
 * 3. Toggle ON: Muestra trabajadores con contrato activo UNION trabajadores con actividad real.
 * 4. Eventuales: Sin contrato ni nómina -> Fijo = 0, Extras = Hours Engine, Total = Extras.
 * 5. Sin Payroll: isPayrollPending = true, pctStatus = 'incomplete_payroll_pending'. NUNCA estima datos.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { addDays, format, parseISO } from 'date-fns';
import type { PayrollAllocationService } from '../payroll/payroll-allocation-service.ts';
import type { ContractTermsService } from '../payroll/contract-terms-service.ts';
import type { PayrollFactRepository } from '../payroll/payroll-fact-repository.ts';
import { Money, LaborCost, Percentage } from '../payroll/value-objects.ts';
import type { LaborCostDayDTO, WorkerLaborCostDTO } from './labor-cost-dtos.ts';
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

export class LaborCostDayReadModelProjector {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly allocationService: PayrollAllocationService,
    private readonly contractTermsService: ContractTermsService,
    private readonly payrollRepo: PayrollFactRepository,
  ) {}

  /**
   * Proyecta el detalle diario del coste laboral para una fecha.
   */
  async projectDayDetail(
    dateYmd: string,
    options?: {
      includeAllContracted?: boolean; // false = Toggle OFF, true = Toggle ON
      userId?: string | null;
    },
  ): Promise<LaborCostDayDTO> {
    const day = dateYmd.split('T')[0]!;
    const periodYm = day.substring(0, 7);
    const includeAll = options?.includeAllContracted ?? false; // Default Toggle OFF

    const weekStart = mondayOf(day);
    const weekEnd = format(addDays(parseISO(weekStart), 6), 'yyyy-MM-dd');

    // 1. Obtener hechos de nómina para verificar si el mes tiene nómina cargada
    const activeFacts = await this.payrollRepo.getActiveFactsForPeriod(periodYm);
    const isPayrollPending = activeFacts.length === 0;

    // 2. Obtener Ventas Netas del día
    let netSalesMoney = Money.zero();
    const { data: salesData } = await this.supabase
      .from('daily_sales')
      .select('total_net_amount')
      .eq('date', day)
      .maybeSingle();

    if (salesData && salesData.total_net_amount) {
      netSalesMoney = Money.from(Number(salesData.total_net_amount));
    }

    // 3. Obtener Plantilla de Trabajadores
    let profilesQuery = this.supabase
      .from('profiles')
      .select(PLANTILLA_EMPLOYEE_SELECT);

    if (options?.userId) {
      profilesQuery = profilesQuery.eq('id', options.userId);
    }

    const { data: profileRows } = await profilesQuery;
    const profiles = filterVisiblePlantillaEmployees(profileRows ?? []);

    const workerDTOs: WorkerLaborCostDTO[] = [];
    let summaryFixed = Money.zero();
    let summaryOvertime = Money.zero();

    for (const profile of profiles) {
      const name = `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() || '—';

      // A. Contrato Activo (Contracts SSOT)
      const hasActiveContract = await this.contractTermsService.isContractActiveOn(
        profile.id,
        day,
      );

      // B. Horas Extras (Hours Engine SSOT)
      let overtimeMoney = Money.zero();
      let hasClockIns = false;

      try {
        const employee = await loadEmployeeBoundaryFacts(this.supabase, profile.id);
        const timelineStart = employeeTimelineStartWeek(employee);
        const logsFromYmd =
          timelineStart && timelineStart < weekStart ? timelineStart : weekStart;
        const { startIso, endIso } = madridRangeUtcIso(logsFromYmd, weekEnd);

        const [snapsRes, logsRes] = await Promise.all([
          this.supabase
            .from('weekly_snapshots')
            .select('week_start, is_paid, prefer_stock_hours_override, overtime_price_snapshot')
            .eq('user_id', profile.id)
            .gte('week_start', logsFromYmd)
            .lte('week_start', weekStart),
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

        hasClockIns = engineLogs.some((l) => formatYmdInMadrid(l.clockInIso) === day);

        if (!snapsRes.error && !logsRes.error) {
          const isPaidByWeek = isPaidLookupFromRows(snapsRes.data ?? []);
          const bagModeOverrideByWeek = bagModeOverrideLookupFromRows(snapsRes.data ?? []);
          const overtimeRateOverrideByWeek = overtimeRateOverrideLookupFromRows(snapsRes.data ?? []);

          const carryIn = resolveOpeningCarryIn({
            employee,
            chainStart: weekStart,
            logs: engineLogs,
            isPaidByWeek,
            bagModeOverrideByWeek,
          });

          const weekLogs = engineLogs.filter((l) => {
            const d = formatYmdInMadrid(l.clockInIso);
            return d >= weekStart && d <= weekEnd;
          });

          const { extrasByDay, summary } = liquidateWeekForCard({
            employee,
            weekStart,
            logs: weekLogs,
            isPaid: isPaidByWeek(weekStart),
            carryIn,
            bagModeOverride: bagModeOverrideByWeek(weekStart),
            overrideRate: overtimeRateOverrideByWeek(weekStart),
          });

          const dayOtShare = extrasByDay[day] ?? 0;
          if (Math.abs(dayOtShare) >= 0.005 && summary.estimatedValue > 0) {
            overtimeMoney = Money.from(dayOtShare);
          }
        }
      } catch {
        // Ignorar trabajadores sin hechos de frontera válidos
      }

      const hasActivity = hasClockIns || !overtimeMoney.isZero();

      // C. Fijo Diario (Payroll Allocation Service)
      let fixedMoney = Money.zero();
      if (!isPayrollPending) {
        const allocation = await this.allocationService.getDailyPayrollCost(
          profile.id,
          day,
        );
        fixedMoney = allocation.dailyFixedCost;
      }

      const isEventual = !hasActiveContract && isPayrollPending;
      if (isEventual) {
        fixedMoney = Money.zero();
      }

      const totalMoney = fixedMoney.add(overtimeMoney);
      const workerPct = Percentage.fromValues(totalMoney, netSalesMoney);

      // Criterios de Inclusión:
      // - Toggle OFF: Muestra únicamente trabajadores con actividad real
      // - Toggle ON: Muestra trabajadores con contrato activo UNION trabajadores con actividad real
      const shouldInclude = includeAll ? (hasActiveContract || hasActivity) : hasActivity;

      if (shouldInclude) {
        workerDTOs.push({
          id: profile.id,
          name,
          fixed: fixedMoney.amount,
          overtime: overtimeMoney.amount,
          total: totalMoney.amount,
          laborPctOfSales: netSalesMoney.isZero() ? null : workerPct.value,
          hasActivity,
          hasActiveContract,
          isEventual,
        });

        summaryFixed = summaryFixed.add(fixedMoney);
        summaryOvertime = summaryOvertime.add(overtimeMoney);
      }
    }

    const summaryTotalCost = summaryFixed.add(summaryOvertime);
    const summaryPct = Percentage.fromValues(summaryTotalCost, netSalesMoney);

    let pctStatus: 'complete' | 'incomplete_payroll_pending' | 'no_sales' = 'complete';
    if (netSalesMoney.isZero()) {
      pctStatus = 'no_sales';
    } else if (isPayrollPending) {
      pctStatus = 'incomplete_payroll_pending';
    }

    return {
      dateYmd: day,
      netSales: netSalesMoney.amount,
      totalFixed: summaryFixed.amount,
      totalOvertime: summaryOvertime.amount,
      totalCost: summaryTotalCost.amount,
      laborPctOfSales: netSalesMoney.isZero() ? null : summaryPct.value,
      isPayrollPending,
      pctStatus,
      workers: workerDTOs,
      reconciliation: null,
    };
  }
}
