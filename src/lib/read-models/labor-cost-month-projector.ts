/**
 * Resumen mensual: fuente oficial de gestoría (incluye bajas y descansos).
 * Calendario diario: coste OPERATIVO de las horas realmente fichadas.
 * Ambos se ofrecen por separado; los totales mensuales NUNCA se sustituyen
 * por la suma de las jornadas operativas.
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
import { loadOperationalMonth } from './labor-operational-cost.ts';
import { resolveLaborPayrollSource } from './labor-payroll-source.ts';

export class LaborCostMonthReadModelProjector {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly dayProjector: LaborCostDayReadModelProjector,
    private readonly payrollRepo: PayrollFactRepository,
    private readonly contractTermsService?: ContractTermsService,
  ) {}

  async projectMonthSummary(
    periodYm: string,
    options?: { includeAllContracted?: boolean; userId?: string | null; todayYmd?: string },
  ): Promise<LaborCostMonthSummaryDTO> {
    const monthDays = ContractTermsService.listMonthDays(periodYm);
    const startDate = monthDays[0]!;
    const endDate = monthDays[monthDays.length - 1]!;
    const workerFilter = options?.userId ?? null;

    const payroll = await resolveLaborPayrollSource(
      this.supabase, this.payrollRepo, periodYm, options?.todayYmd,
    );
    const activeFacts = payroll.officialFacts;
    const calculationFacts = payroll.calculationFacts;
    const summaryRow = payroll.officialSummary;
    const officialCost = summaryRow?.total_company_cost == null
      ? null : Number(summaryRow.total_company_cost);
    const isPayrollPending = payroll.isPayrollPending;
    const isPayrollEstimated = payroll.isPayrollEstimated;
    // La conciliación siempre usa exclusivamente nóminas y resumen oficiales.
    const reconciliation = computePeriodReconciliation({ summaryCost: officialCost, activeFacts });

    // Mes corriente pendiente: el importe provisional es el total oficial del
    // mes anterior; por trabajador se usan únicamente sus nóminas anteriores.
    // Nunca se mezclan hechos parciales del mes en curso con esa proyección.
    const fixedPeriodCost = isPayrollPending && !isPayrollEstimated ? 0 : workerFilter
      ? calculationFacts.filter((fact) => fact.user_id === workerFilter)
          .reduce((sum, fact) => sum + Number(fact.total_company_cost), 0)
      : isPayrollEstimated ? payroll.estimatedCompanyCost! : officialCost!;

    const fixedByDate = !isPayrollPending || isPayrollEstimated
      ? allocatePayrollToNaturalDays(
          fixedPeriodCost,
          String(summaryRow?.period_start ?? startDate).slice(0, 10),
          String(summaryRow?.period_end ?? endDate).slice(0, 10),
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

    const operational = await loadOperationalMonth(
      this.supabase, periodYm, calculationFacts,
      String(summaryRow?.period_start ?? startDate).slice(0, 10),
      String(summaryRow?.period_end ?? endDate).slice(0, 10),
      isPayrollPending, workerFilter,
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
      const dayOperational = operational[day]!;
      const netSales = Money.from(salesByDate.get(day) ?? 0);
      byDate[day] = {
        totalCost: dayOperational.total,
        totalFixed: dayOperational.fixed,
        totalOvertime: dayOperational.overtime,
        total: dayOperational.total,
        fixed: dayOperational.fixed,
        overtime: dayOperational.overtime,
        // Independiente de las horas efectivas: usado SOLO por el resumen mensual.
        accountingFixed: fixed.amount,
        accountingOvertime: overtime.amount,
        operationalIncomplete: dayOperational.incomplete,
        operationalMissingWorkers: dayOperational.missingWorkers,
        hasActivity: dayOperational.hasWorked,
        laborPctOfSales: dayOperational.incomplete || netSales.amount <= 0
          ? null : Percentage.fromValues(Money.from(dayOperational.total), netSales).value,
      };
      totalFixed = totalFixed.add(fixed);
      totalOvertime = totalOvertime.add(overtime);
    }

    return {
      periodYm,
      byDate,
      totalFixed: totalFixed.amount,
      totalOvertime: totalOvertime.amount,
      // La nómina oficial YA puede incorporar las extras; no sumarlas dos veces.
      totalCost: isPayrollPending && !isPayrollEstimated ? 0 : totalFixed.amount,
      isPayrollPending,
      isPayrollEstimated,
      missingPayrollMonths: isPayrollPending ? [periodYm] : [],
      reconciliation,
    };
  }
}
