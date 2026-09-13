/**
 * LaborCostDayReadModelProjector (FASE 4).
 *
 * Consume exclusivamente:
 * - PayrollAllocationService (Payroll Domain)
 * - ContractTermsService (Contracts SSOT)
 * - weekly_snapshot_days.overtime_cost (proyección persistida)
 * - Ventas (daily_sales / ticket_sales)
 *
 * REGLAS INVIOLABLES:
 * 1. NUNCA incluye la fila sintética "Nómina empresa". Desaparece al 100%.
 * 2. Toggle OFF: Filtra únicamente trabajadores con actividad real (fichajes > 0 u extras > 0). Resumen = suma exclusiva de los visibles.
 * 3. Toggle ON: Muestra trabajadores con contrato activo UNION trabajadores con actividad real.
 * 4. Eventuales: Sin contrato ni nómina -> Fijo = 0, Extras = proyección, Total = Extras.
 * 5. Sin Payroll: isPayrollPending = true, pctStatus = 'incomplete_payroll_pending'. NUNCA estima datos.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { PayrollAllocationService } from '../payroll/payroll-allocation-service.ts';
import type { ContractTermsService } from '../payroll/contract-terms-service.ts';
import type { PayrollFactRepository } from '../payroll/payroll-fact-repository.ts';
import { Money, Percentage } from '../payroll/value-objects.ts';
import type { LaborCostDayDTO, WorkerLaborCostDTO } from './labor-cost-dtos.ts';
import { loadOvertimeCostByDay } from './overtime-cost-from-projection.ts';
import { formatYmdInMadrid, madridRangeUtcIso } from '../madrid-date-bounds.ts';
import {
  filterVisiblePlantillaEmployees,
  PLANTILLA_EMPLOYEE_SELECT,
} from '../staff/plantilla-employees.ts';

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

    // 1. Obtener hechos de nómina para verificar si el mes tiene nómina cargada.
    //    También se reutilizan estos mismos hechos para calcular el coste mensual por trabajador,
    //    evitando volver a consultar employee_payroll_facts dentro del bucle.
    const activeFacts = await this.payrollRepo.getActiveFactsForPeriod(periodYm);
    const isPayrollPending = activeFacts.length === 0;
    const payrollFactsByUser = new Map<string, typeof activeFacts>();
    for (const fact of activeFacts) {
      const facts = payrollFactsByUser.get(fact.user_id) ?? [];
      facts.push(fact);
      payrollFactsByUser.set(fact.user_id, facts);
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
    const profileIds = profiles.map((profile) => profile.id);

    // 4. Contratos del mes en una sola carga. Extra diario: proyección persistida.
    let contractStore;

    try {
      contractStore = await this.contractTermsService.loadTermsForMonth(profileIds, periodYm);
    } catch {
      contractStore = null;
    }

    const overtimeByUser = await loadOvertimeCostByDay(this.supabase, profileIds, day, day);
    const clockInUsers = new Set<string>();
    if (profileIds.length > 0) {
      const { startIso, endIso } = madridRangeUtcIso(day, day);
      const { data: logRows, error: logsErr } = await this.supabase
        .from('time_logs')
        .select('user_id, clock_in')
        .in('user_id', profileIds)
        .gte('clock_in', startIso)
        .lte('clock_in', endIso);
      if (logsErr) {
        throw new Error(`time_logs: ${logsErr.message}`);
      }
      for (const row of logRows ?? []) {
        if (formatYmdInMadrid(row.clock_in) === day) {
          clockInUsers.add(String(row.user_id));
        }
      }
    }

    const workerDTOs: WorkerLaborCostDTO[] = [];
    let summaryFixed = Money.zero();
    let summaryOvertime = Money.zero();

    for (const profile of profiles) {
      const name = `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() || '—';

      const hasActiveContract = contractStore
        ? contractStore.isContractActiveOn(profile.id, day)
        : await this.contractTermsService.isContractActiveOn(profile.id, day);

      const overtimeMoney = Money.from(
        overtimeByUser.get(profile.id)?.get(day)?.overtimeCost ?? 0,
      );
      const hasClockIns = clockInUsers.has(profile.id);

      const hasActivity = hasClockIns || !overtimeMoney.isZero();

      // C. Fijo Diario (Payroll facts ya cargados para todo el periodo).
      let fixedMoney = Money.zero();
      const userFacts = payrollFactsByUser.get(profile.id) ?? [];
      if (!isPayrollPending && userFacts.length > 0) {
        const monthlyCompanyCost = userFacts.reduce(
          (sum, fact) => sum + Number(fact.total_company_cost),
          0,
        );
        const activeContractDays = contractStore
          ? contractStore.getActiveContractDays(profile.id, periodYm)
          : await this.contractTermsService.getActiveContractDays(profile.id, periodYm);

        if (hasActiveContract && activeContractDays > 0 && monthlyCompanyCost !== 0) {
          fixedMoney = Money.from(monthlyCompanyCost).divide(activeContractDays);
        }
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
