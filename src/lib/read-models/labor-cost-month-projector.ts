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
import type { LaborCostMonthSummaryDTO, LaborCostWorkerAmount } from './labor-cost-dtos.ts';
import { Money, Percentage } from '../payroll/value-objects.ts';
import { loadOvertimeCostByDay } from './overtime-cost-from-projection.ts';
import { PLANTILLA_EMPLOYEE_SELECT } from '../staff/plantilla-employees.ts';
import { allocatePayrollToNaturalDays } from '../hours-engine/payroll-ordinary-daily.ts';
import { computePeriodReconciliation } from '../payroll/payroll-reconciliation-service.ts';
import { loadOperationalMonth } from './labor-operational-cost.ts';
import { resolveLaborPayrollSource } from './labor-payroll-source.ts';

const cents = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const HECTOR_EMAIL = 'hhector7722@gmail.com';
const HECTOR_MONTHLY_EXTRA_EUR = 1000;

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
    const profileById = new Map((profileRows ?? []).map(p => [
      p.id,
      [p.first_name, p.last_name].filter(Boolean).join(' ').trim() || 'Trabajador sin nombre',
    ]));
    const workerName = (id: string) => profileById.get(id) ?? 'Trabajador sin ficha';
    const hector = (profileRows ?? []).find(p =>
      String(p.email ?? '').trim().toLowerCase() === HECTOR_EMAIL,
    );
    const includeHectorExtra = Boolean(hector && (!workerFilter || workerFilter === hector.id));
    const hectorByDate = includeHectorExtra
      ? allocatePayrollToNaturalDays(HECTOR_MONTHLY_EXTRA_EUR, startDate, endDate)
      : {};

    // Misma fuente y periodo que Nóminas: reparto individual por día.
    // El posible resto del resumen oficial (trabajadores aún sin ficha)
    // queda como "Costes sin asignar" en lugar de desaparecer.
    const payrollByUser = new Map<string, number>();
    if (!isPayrollPending || isPayrollEstimated) {
      for (const fact of calculationFacts) {
        if (workerFilter && fact.user_id !== workerFilter) continue;
        payrollByUser.set(fact.user_id,
          (payrollByUser.get(fact.user_id) ?? 0) + Number(fact.total_company_cost));
      }
    }
    const payrollDailyByUser = Array.from(payrollByUser, ([userId, cost]) => ({
      userId,
      name: workerName(userId),
      daily: allocatePayrollToNaturalDays(cost, startDate, endDate),
    }));

    // Los costes históricos incluyen también exempleados que ya no aparecen
    // en la plantilla visible. Excluirlos infravaloraba las horas extras.
    const workerIds = (profileRows ?? [])
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
    const payrollWorkersByDate: Record<string, LaborCostWorkerAmount[]> = {};
    const overtimeWorkersByDate: Record<string, LaborCostWorkerAmount[]> = {};
    const hectorExtraByDate: Record<string, number> = {};
    let totalFixed = Money.zero();
    let totalOvertime = Money.zero();

    for (const day of monthDays) {
      const fixed = Money.from(fixedByDate[day] ?? 0);
      const payrollWorkers: LaborCostWorkerAmount[] = payrollDailyByUser
        .map(entry => ({
          userId: entry.userId,
          name: entry.name,
          amount: Number(entry.daily[day] ?? 0),
        }))
        .filter(entry => entry.amount !== 0);
      const payrollRemainder = cents(fixed.amount -
        payrollWorkers.reduce((sum, row) => sum + row.amount, 0));
      if (payrollRemainder !== 0) {
        payrollWorkers.push({
          userId: 'unassigned',
          name: 'Costes sin asignar',
          amount: payrollRemainder,
        });
      }
      payrollWorkersByDate[day] = payrollWorkers;

      let overtime = Money.zero();
      const overtimeWorkers: LaborCostWorkerAmount[] = [];
      for (const [userId, userDays] of overtimeByUser) {
        const cost = Number(userDays.get(day)?.overtimeCost ?? 0);
        overtime = overtime.add(Money.from(cost));
        if (cost !== 0) {
          overtimeWorkers.push({ userId, name: workerName(userId), amount: cost });
        }
      }
      overtimeWorkersByDate[day] = overtimeWorkers;
      const hectorExtra = Money.from(hectorByDate[day] ?? 0);
      hectorExtraByDate[day] = hectorExtra.amount;
      const accountingExtras = overtime.add(hectorExtra);
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
        accountingOvertime: accountingExtras.amount,
        operationalIncomplete: dayOperational.incomplete,
        operationalMissingWorkers: dayOperational.missingWorkers,
        hasActivity: dayOperational.hasWorked,
        laborPctOfSales: dayOperational.incomplete || netSales.amount <= 0
          ? null : Percentage.fromValues(Money.from(dayOperational.total), netSales).value,
      };
      totalFixed = totalFixed.add(fixed);
      totalOvertime = totalOvertime.add(accountingExtras);
    }

    return {
      periodYm,
      byDate,
      totalFixed: totalFixed.amount,
      totalOvertime: totalOvertime.amount,
      // Regla del resumen superior: coste laboral = nóminas + extras,
      // incluyendo el concepto fijo mensual de Héctor.
      totalCost: cents(totalFixed.amount + totalOvertime.amount),
      payrollWorkersByDate,
      overtimeWorkersByDate,
      hectorExtraByDate,
      isPayrollPending,
      isPayrollEstimated,
      missingPayrollMonths: isPayrollPending ? [periodYm] : [],
      reconciliation,
    };
  }
}
