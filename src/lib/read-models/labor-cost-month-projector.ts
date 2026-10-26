/**
 * Calendario de coste laboral: fuente de verdad = resumen oficial de gestoría.
 *
 * El coste de nómina se prorratea por días naturales del periodo del PDF.
 * No depende de fichajes ni de la visibilidad actual de los empleados:
 * los trabajadores dados de baja también forman parte del coste real.
 * Las extras siguen leyendo la proyección persistida por trabajador.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { ContractTermsService } from '../payroll/contract-terms-service.ts';
import type { LaborCostDayReadModelProjector } from './labor-cost-day-projector.ts';
import type { PayrollFactRepository } from '../payroll/payroll-fact-repository.ts';
import type { LaborCostMonthSummaryDTO } from './labor-cost-dtos.ts';
import { Money, Percentage } from '../payroll/value-objects.ts';
import { loadOvertimeCostByDay } from './overtime-cost-from-projection.ts';
import { filterVisiblePlantillaEmployees, PLANTILLA_EMPLOYEE_SELECT } from '../staff/plantilla-employees.ts';
import { allocatePayrollToNaturalDays } from '../hours-engine/payroll-ordinary-daily.ts';
import { computePeriodReconciliation } from '../payroll/payroll-reconciliation-service.ts';

export class LaborCostMonthReadModelProjector {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly dayProjector: LaborCostDayReadModelProjector,
    private readonly payrollRepo: PayrollFactRepository,
    private readonly contractTermsService?: ContractTermsService,
  ) {}

  async projectMonthSummary(
    periodYm: string,
    options?: { includeAllContracted?: boolean; userId?: string | null },
  ): Promise<LaborCostMonthSummaryDTO> {
    const monthDays = ContractTermsService.listMonthDays(periodYm);
    const startDate = monthDays[0]!;
    const endDate = monthDays[monthDays.length - 1]!;
    const workerFilter = options?.userId ?? null;

    const activeFacts = await this.payrollRepo.getActiveFactsForPeriod(periodYm);
    const { data: summaryRow, error: summaryError } = await this.supabase
      .from('payroll_monthly_totals')
      .select('period_ym, period_start, period_end, total_company_cost')
      .eq('period_ym', periodYm)
      .maybeSingle();
    if (summaryError) throw new Error(`payroll_monthly_totals: ${summaryError.message}`);

    const officialCost = summaryRow?.total_company_cost == null
      ? null : Number(summaryRow.total_company_cost);
    const isPayrollPending = officialCost === null;
    const reconciliation = computePeriodReconciliation({ summaryCost: officialCost, activeFacts });

    // Sin filtro: TOTAL oficial de empresa, incluidos empleados no visibles en plantilla.
    // Con filtro: sólo hechos contables activos del trabajador elegido.
    const fixedPeriodCost = isPayrollPending ? 0 : workerFilter
      ? activeFacts.filter((fact) => fact.user_id === workerFilter)
          .reduce((sum, fact) => sum + Number(fact.total_company_cost), 0)
      : officialCost;

    const fixedByDate = !isPayrollPending && summaryRow
      ? allocatePayrollToNaturalDays(
          fixedPeriodCost,
          String(summaryRow.period_start).slice(0, 10),
          String(summaryRow.period_end).slice(0, 10),
        )
      : {};

    // cash_closings es la misma fuente neta usada por get_cash_closings_summary
    // en la cabecera del dashboard. La tabla "daily_sales" no existe.
    const { data: salesRows, error: salesError } = await this.supabase
      .from('cash_closings')
      .select('closing_date, net_sales')
      .gte('closing_date', startDate)
      .lte('closing_date', endDate);
    if (salesError) throw new Error(`cash_closings: ${salesError.message}`);

    const salesByDate = new Map<string, number>();
    for (const row of salesRows ?? []) {
      const day = String(row.closing_date);
      salesByDate.set(day, (salesByDate.get(day) ?? 0) + Number(row.net_sales ?? 0));
    }

    const { data: profileRows, error: profileError } = await this.supabase
      .from('profiles')
      .select(PLANTILLA_EMPLOYEE_SELECT);
    if (profileError) throw new Error(`profiles: ${profileError.message}`);
    const workerIds = filterVisiblePlantillaEmployees(profileRows ?? [])
      .map((p) => p.id)
      .filter((id) => !workerFilter || id === workerFilter);
    const overtimeByUser = await loadOvertimeCostByDay(
      this.supabase, workerIds, startDate, endDate,
    );

    const byDate: LaborCostMonthSummaryDTO['byDate'] = {};
    let totalFixed = Money.zero();
    let totalOvertime = Money.zero();

    for (const day of monthDays) {
      const fixed = Money.from(fixedByDate[day] ?? 0);
      let overtime = Money.zero();
      for (const userDays of overtimeByUser.values()) {
        overtime = overtime.add(Money.from(userDays.get(day)?.overtimeCost ?? 0));
      }
      const dayTotal = fixed.add(overtime);
      const netSales = Money.from(salesByDate.get(day) ?? 0);
      byDate[day] = {
        totalCost: dayTotal.amount,
        totalFixed: fixed.amount,
        totalOvertime: overtime.amount,
        total: dayTotal.amount,
        fixed: fixed.amount,
        overtime: overtime.amount,
        laborPctOfSales: netSales.isZero()
          ? null : Percentage.fromValues(dayTotal, netSales).value,
      };
      totalFixed = totalFixed.add(fixed);
      totalOvertime = totalOvertime.add(overtime);
    }

    return {
      periodYm,
      byDate,
      totalFixed: totalFixed.amount,
      totalOvertime: totalOvertime.amount,
      totalCost: totalFixed.add(totalOvertime).amount,
      isPayrollPending,
      missingPayrollMonths: isPayrollPending ? [periodYm] : [],
      reconciliation,
    };
  }
}
