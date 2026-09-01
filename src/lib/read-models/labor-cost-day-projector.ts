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
import { Money, Percentage } from '../payroll/value-objects.ts';
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
   *
   * Los datos estáticos del período (hechos de nómina y perfiles) y los contratos
   * del período se cargan en lote para evitar N+1. La liquidación semanal sigue
   * utilizando el mismo Hours Engine y el mismo horizonte histórico necesario
   * para conservar exactamente el carry existente.
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
    const includeAll = options?.includeAllContracted ?? false;

    const weekStart = mondayOf(day);
    const weekEnd = format(addDays(parseISO(weekStart), 6), 'yyyy-MM-dd');

    // 1. Hechos de nómina del período: una sola consulta para todo el día.
    const activeFacts = await this.payrollRepo.getActiveFactsForPeriod(periodYm);
    const isPayrollPending = activeFacts.length === 0;

    // Índice de coste empresa consolidado por trabajador a partir de los hechos
    // ya cargados. Sustituye las consultas repetidas de PayrollAllocationService
    // sin alterar la fórmula oficial.
    const monthlyCompanyCostByUser = new Map<string, number>();
    const payrollFactCountByUser = new Map<string, number>();
    for (const fact of activeFacts) {
      monthlyCompanyCostByUser.set(
        fact.user_id,
        (monthlyCompanyCostByUser.get(fact.user_id) ?? 0) + Number(fact.total_company_cost),
      );
      payrollFactCountByUser.set(
        fact.user_id,
        (payrollFactCountByUser.get(fact.user_id) ?? 0) + 1,
      );
    }

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
    const workerIds = profiles.map((profile) => profile.id);

    // 4. Cargar contratos del período en lote y resolverlos en memoria.
    const contractStore = await this.contractTermsService.loadTermsForMonth(workerIds, periodYm);

    const workerDTOs: WorkerLaborCostDTO[] = [];
    let summaryFixed = Money.zero();
    let summaryOvertime = Money.zero();

    // Cálculo de D_vigentes y actividad contractual sin I/O por trabajador.
    const activeContractDaysByUser = new Map<string, number>();
    const hasActiveContractByUser = new Map<string, boolean>();
    for (const profile of profiles) {
      const activeDays = contractStore.getActiveContractDays(profile.id, periodYm);
      const hasActiveContract = contractStore.isContractActiveOn(profile.id, day);
      activeContractDaysByUser.set(profile.id, activeDays);
      hasActiveContractByUser.set(profile.id, hasActiveContract);
    }

    for (const profile of profiles) {
      const name = `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() || '—';
      const hasActiveContract = hasActiveContractByUser.get(profile.id) ?? false;

      // B. Horas Extras (Hours Engine SSOT)
      let overtimeMoney = Money.zero();
      let hasClockIns = false;

      try {
        // Conservamos exactamente el horizonte histórico anterior para que el
        // opening carry y la liquidación semanal produzcan el mismo resultado.
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
          if (Math.abs(dayOtShare) >= 0.005 && (summary.estimatedValue ?? 0) > 0) {
            overtimeMoney = Money.from(dayOtShare);
          }
        }
      } catch {
        // Ignorar trabajadores sin hechos de frontera válidos
      }

      const hasActivity = hasClockIns || !overtimeMoney.isZero();

      // C. Fijo Diario (misma fórmula oficial que PayrollAllocationService,
      // pero usando los hechos ya cargados en esta operación).
      let fixedMoney = Money.zero();
      if (!isPayrollPending) {
        const monthlyCompanyCost = Money.from(monthlyCompanyCostByUser.get(profile.id) ?? 0);
        const activeContractDays = activeContractDaysByUser.get(profile.id) ?? 0;

        if (hasActiveContract && activeContractDays > 0 && !monthlyCompanyCost.isZero()) {
          fixedMoney = monthlyCompanyCost.divide(activeContractDays);
        }
      }

      const isEventual = !hasActiveContract && isPayrollPending;
      if (isEventual) {
        fixedMoney = Money.zero();
      }

      const totalMoney = fixedMoney.add(overtimeMoney);
      const workerPct = Percentage.fromValues(totalMoney, netSalesMoney);

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
