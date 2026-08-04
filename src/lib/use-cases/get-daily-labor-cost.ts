/**
 * GetDailyLaborCostUseCase (FASE 7 - Cutover Definitivo V2).
 *
 * Capa de aplicación de la arquitectura limpia (Clean Architecture / CQRS).
 * Encapsula la orquestación del detalle diario de coste laboral:
 * - Recibe opciones de la Server Action (fecha, toggle OFF/ON, usuario específico).
 * - Invoca la proyección del Read Model V2 (`LaborCostDayReadModelProjector`).
 * - Retorna exclusivamente el DTO inmutable `LaborCostDayDTO`.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { LaborCostDayReadModelProjector } from '../read-models/labor-cost-day-projector.ts';
import { PayrollAllocationService } from '../payroll/payroll-allocation-service.ts';
import { ContractTermsService } from '../payroll/contract-terms-service.ts';
import { PayrollFactRepository } from '../payroll/payroll-fact-repository.ts';
import type { LaborCostDayDTO } from '../read-models/labor-cost-dtos.ts';

export class GetDailyLaborCostUseCase {
  private readonly dayProjector: LaborCostDayReadModelProjector;

  constructor(private readonly supabase: SupabaseClient) {
    const payrollRepo = new PayrollFactRepository(supabase);
    const contractTermsService = new ContractTermsService(supabase);
    const allocationService = new PayrollAllocationService(payrollRepo, contractTermsService);
    this.dayProjector = new LaborCostDayReadModelProjector(
      supabase,
      allocationService,
      contractTermsService,
      payrollRepo,
    );
  }

  /**
   * Ejecuta el Caso de Uso para obtener el coste laboral diario SSOT V2.
   */
  async execute(
    dateYmd: string,
    options?: {
      includeAllContracted?: boolean;
      userId?: string | null;
    },
  ): Promise<LaborCostDayDTO> {
    return this.dayProjector.projectDayDetail(dateYmd, options);
  }
}
