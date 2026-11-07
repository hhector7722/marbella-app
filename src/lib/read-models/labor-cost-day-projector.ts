/**
 * Detalle operativo de una jornada: la nómina mensual NO se reparte a descansos.
 * Las horas trabajadas se valoran usando el coste empresa por hora contractual.
 * El acumulado mensual oficial permanece en el proyector mensual (separado).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PayrollAllocationService } from '../payroll/payroll-allocation-service.ts';
import { ContractTermsService } from '../payroll/contract-terms-service.ts';
import type { PayrollFactRepository } from '../payroll/payroll-fact-repository.ts';
import { Money, Percentage } from '../payroll/value-objects.ts';
import type { LaborCostDayDTO, WorkerLaborCostDTO } from './labor-cost-dtos.ts';
import { filterVisiblePlantillaEmployees, PLANTILLA_EMPLOYEE_SELECT } from '../staff/plantilla-employees.ts';
import { loadOperationalMonth } from './labor-operational-cost.ts';
import { resolveLaborPayrollSource } from './labor-payroll-source.ts';

const LABOR_PROFILE_SELECT = `${PLANTILLA_EMPLOYEE_SELECT}, staffing_mode` as const;

export class LaborCostDayReadModelProjector {
  constructor(
    private readonly supabase: SupabaseClient,
    // Conservadas para mantener la interfaz de creación de read models.
    private readonly allocationService: PayrollAllocationService,
    private readonly contractTermsService: ContractTermsService,
    private readonly payrollRepo: PayrollFactRepository,
  ) {
    void this.allocationService;
  }

  async projectDayDetail(
    dateYmd: string,
    options?: { includeAllContracted?: boolean; userId?: string | null; todayYmd?: string },
  ): Promise<LaborCostDayDTO> {
    const day = dateYmd.slice(0, 10);
    const periodYm = day.slice(0, 7);
    const includeAll = options?.includeAllContracted ?? false;
    const workerFilter = options?.userId ?? null;
    const [payroll, salesResult, profilesResult] = await Promise.all([
      resolveLaborPayrollSource(this.supabase, this.payrollRepo, periodYm, options?.todayYmd),
      this.supabase.from('cash_closings')
        .select('net_sales').eq('closing_date', day),
      this.supabase.from('profiles').select(LABOR_PROFILE_SELECT),
    ]);
    if (salesResult.error) throw new Error('cash_closings: ' + salesResult.error.message);
    if (profilesResult.error) throw new Error('profiles: ' + profilesResult.error.message);

    const summary = payroll.officialSummary;
    const isPayrollPending = payroll.isPayrollPending;
    const activeFacts = payroll.calculationFacts;
    const monthDays = ContractTermsService.listMonthDays(periodYm);
    const operational = await loadOperationalMonth(
      this.supabase, periodYm, activeFacts,
      String(summary?.period_start ?? monthDays[0]).slice(0, 10),
      String(summary?.period_end ?? monthDays[monthDays.length - 1]).slice(0, 10),
      isPayrollPending, workerFilter,
    );
    const current = operational[day]!;
    const netSales = Money.from((salesResult.data ?? [])
      .reduce((sum, row) => sum + Number(row.net_sales ?? 0), 0));
    const visible = filterVisiblePlantillaEmployees(profilesResult.data ?? []);
    const paidIds = new Set(activeFacts.map(fact => fact.user_id));
    const profiles = [
      ...visible,
      ...(profilesResult.data ?? []).filter(p =>
        paidIds.has(p.id) && !visible.some(v => v.id === p.id)),
    ].filter(p => !workerFilter || p.id === workerFilter);
    const workedById = new Map(current.workers.map(worker => [worker.userId, worker]));
    const contractStore = await this.contractTermsService.loadTermsForMonth(
      profiles.map(p => p.id), periodYm,
    );

    const workers: WorkerLaborCostDTO[] = profiles.flatMap(profile => {
      const worked = workedById.get(profile.id);
      const hasActivity = Boolean(worked && worked.hours > 0);
      const activeContract = contractStore.isContractActiveOn(profile.id, day);
      if (!hasActivity && !includeAll) return [];
      if (!hasActivity && !activeContract && !paidIds.has(profile.id)) return [];
      const fixed = Money.from(worked?.ordinaryCost ?? 0);
      const overtime = Money.from(worked?.overtimeCost ?? 0);
      const total = fixed.add(overtime);
      const known = Boolean(worked?.costKnown);
      return [{
        id: profile.id,
        name: `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() || '—',
        fixed: fixed.amount,
        overtime: overtime.amount,
        total: total.amount,
        laborPctOfSales: hasActivity && !current.incomplete && netSales.amount > 0
          ? Percentage.fromValues(total, netSales).value : null,
        hasActivity,
        hasActiveContract: activeContract,
        isEventual: profile.staffing_mode === 'managed_extra',
        workedHours: worked?.hours ?? 0,
        costKnown: hasActivity ? known : true,
      }];
    });
    const pctStatus = current.incomplete
      ? (isPayrollPending ? 'incomplete_payroll_pending' : 'incomplete_operational')
      : netSales.amount <= 0 ? 'no_sales' : 'complete';
    return {
      dateYmd: day,
      netSales: netSales.amount,
      totalFixed: current.fixed,
      totalOvertime: current.overtime,
      totalCost: current.total,
      laborPctOfSales: pctStatus === 'complete'
        ? Percentage.fromValues(Money.from(current.total), netSales).value : null,
      isPayrollPending,
      isPayrollEstimated: payroll.isPayrollEstimated,
      pctStatus,
      operationalIncomplete: current.incomplete,
      operationalMissingWorkers: current.missingWorkers,
      workers,
      reconciliation: null,
    };
  }
}
