/**
 * Resumen de coste laboral para mes o rango.
 *
 * Cada mes usa exactamente la misma proyección oficial; las selecciones
 * parciales suman únicamente sus días, evitando volver a calcular costes
 * por fichajes y evitando N consultas por cada día del rango.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { LaborCostDayReadModelProjector } from '../read-models/labor-cost-day-projector.ts';
import { LaborCostMonthReadModelProjector } from '../read-models/labor-cost-month-projector.ts';
import { PayrollAllocationService } from '../payroll/payroll-allocation-service.ts';
import { ContractTermsService } from '../payroll/contract-terms-service.ts';
import { PayrollFactRepository } from '../payroll/payroll-fact-repository.ts';
import { Money } from '../payroll/value-objects.ts';
import { getISOWeek, getISOWeekYear } from 'date-fns';
import { mondayOnOrBefore } from '../hours-engine/week-dates.ts';
import type { CivilDate } from '../hours-engine/types.ts';
import type { LaborCostWorkerAmount, LaborCostOvertimeWeek } from '../read-models/labor-cost-dtos.ts';
import type { PayrollReconciliationSummaryDTO } from '../../types/payroll-import.ts';

export interface MonthlyLaborCostSummaryDTO {
  startDate: string;
  endDate: string;
  byDate: Record<
    string,
    {
      totalCost: number;
      totalFixed: number;
      totalOvertime: number;
      total: number;
      fixed: number;
      overtime: number;
      laborPctOfSales: number | null;
      operationalIncomplete: boolean;
      operationalMissingWorkers: number;
      hasActivity: boolean;
    }
  >;
  totalFixed: number;
  totalOvertime: number;
  totalCost: number;
  payrollBreakdown: LaborCostWorkerAmount[];
  overtimeWeeks: LaborCostOvertimeWeek[];
  hectorMonthlyExtra: number;
  isPayrollPending: boolean;
  missingPayrollMonths: string[];
  estimatedPayrollMonths: string[];
  reconciliation: PayrollReconciliationSummaryDTO;
}

export class GetMonthlyLaborCostSummaryUseCase {
  private readonly monthProjector: LaborCostMonthReadModelProjector;

  constructor(supabase: SupabaseClient) {
    const payrollRepo = new PayrollFactRepository(supabase);
    const contractTermsService = new ContractTermsService(supabase);
    const allocationService = new PayrollAllocationService(payrollRepo, contractTermsService);
    const dayProjector = new LaborCostDayReadModelProjector(
      supabase, allocationService, contractTermsService, payrollRepo,
    );
    this.monthProjector = new LaborCostMonthReadModelProjector(
      supabase, dayProjector, payrollRepo, contractTermsService,
    );
  }

  async execute(input: {
    startDate: string;
    endDate: string;
    userId?: string | null;
    /** Fecha inyectable en pruebas; normalmente se usa el reloj de Madrid. */
    todayYmd?: string;
  }): Promise<MonthlyLaborCostSummaryDTO> {
    const startDate = input.startDate.slice(0, 10);
    const endDate = input.endDate.slice(0, 10);
    if (endDate < startDate) throw new Error('Rango de coste laboral inválido');

    const byDate: MonthlyLaborCostSummaryDTO['byDate'] = {};
    const missingMonths = new Set<string>();
    const estimatedMonths = new Set<string>();
    const payrollWorkers = new Map<string, LaborCostWorkerAmount>();
    const overtimeWeeks = new Map<string, {
      employees: Map<string, LaborCostWorkerAmount>;
      amount: number;
    }>();
    let hectorMonthlyExtra = Money.zero();
    const addWorker = (target: Map<string, LaborCostWorkerAmount>, row: LaborCostWorkerAmount) => {
      const previous = target.get(row.userId);
      target.set(row.userId, {
        userId: row.userId,
        name: row.name,
        amount: Money.from(previous?.amount ?? 0).add(Money.from(row.amount)).amount,
      });
    };
    let totalFixed = Money.zero();
    let totalOvertime = Money.zero();
    let reconciliation: PayrollReconciliationSummaryDTO | null = null;

    let [year, month] = startDate.slice(0, 7).split('-').map(Number) as [number, number];
    const lastMonth = endDate.slice(0, 7);

    while (`${year}-${String(month).padStart(2, '0')}` <= lastMonth) {
      const ym = `${year}-${String(month).padStart(2, '0')}`;
      const monthDto = await this.monthProjector.projectMonthSummary(ym, {
        userId: input.userId ?? null,
        todayYmd: input.todayYmd,
      });
      if (!reconciliation) reconciliation = monthDto.reconciliation;
      for (const [date, cell] of Object.entries(monthDto.byDate)) {
        if (date < startDate || date > endDate) continue;
        byDate[date] = {
          totalCost: cell.totalCost,
          totalFixed: cell.totalFixed,
          totalOvertime: cell.totalOvertime,
          total: cell.totalCost,
          fixed: cell.totalFixed,
          overtime: cell.totalOvertime,
          laborPctOfSales: cell.laborPctOfSales,
          operationalIncomplete: Boolean(cell.operationalIncomplete),
          operationalMissingWorkers: cell.operationalMissingWorkers ?? 0,
          hasActivity: Boolean(cell.hasActivity),
        };
        totalFixed = totalFixed.add(Money.from(cell.accountingFixed ?? 0));
        totalOvertime = totalOvertime.add(Money.from(cell.accountingOvertime ?? 0));
        for (const row of monthDto.payrollWorkersByDate[date] ?? []) {
          addWorker(payrollWorkers, row);
        }
        for (const row of monthDto.overtimeWorkersByDate[date] ?? []) {
          const weekStart = mondayOnOrBefore(date as CivilDate);
          let week = overtimeWeeks.get(weekStart);
          if (!week) {
            week = { employees: new Map(), amount: 0 };
            overtimeWeeks.set(weekStart, week);
          }
          addWorker(week.employees, row);
          week.amount = Money.from(week.amount).add(Money.from(row.amount)).amount;
        }
        hectorMonthlyExtra = hectorMonthlyExtra.add(
          Money.from(monthDto.hectorExtraByDate[date] ?? 0),
        );
      }
      for (const missing of monthDto.missingPayrollMonths) missingMonths.add(missing);
      if (monthDto.isPayrollEstimated) estimatedMonths.add(ym);
      if (++month === 13) { year++; month = 1; }
    }

    if (!reconciliation) throw new Error('No se pudo calcular la conciliación de nóminas');
    const payrollBreakdown = Array.from(payrollWorkers.values())
      .filter(row => row.amount !== 0)
      .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, 'es'));
    const overtimeBreakdown = Array.from(overtimeWeeks, ([weekStart, week]) => {
      const date = new Date(weekStart + 'T12:00:00');
      return {
        weekStart,
        weekNumber: getISOWeek(date),
        weekYear: getISOWeekYear(date),
        amount: week.amount,
        employees: Array.from(week.employees.values())
          .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, 'es')),
      };
    }).sort((a, b) => a.weekStart.localeCompare(b.weekStart));
    return {
      startDate,
      endDate,
      byDate,
      totalFixed: totalFixed.amount,
      totalOvertime: totalOvertime.amount,
      // El resumen solicitado suma nóminas y extras, incluido Héctor.
      // Los meses pendientes sin referencia siguen siendo desconocidos en UI.
      totalCost: totalFixed.add(totalOvertime).amount,
      payrollBreakdown,
      overtimeWeeks: overtimeBreakdown,
      hectorMonthlyExtra: hectorMonthlyExtra.amount,
      isPayrollPending: missingMonths.size > 0,
      missingPayrollMonths: Array.from(missingMonths),
      estimatedPayrollMonths: Array.from(estimatedMonths),
      reconciliation,
    };
  }
}
