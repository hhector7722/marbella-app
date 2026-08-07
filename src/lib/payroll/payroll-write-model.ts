/**
 * Write Model de Payroll SSOT (FASE 2 - Atómico PostgreSQL).
 *
 * Exclusivamente encargado de la persistencia e ingesta inmutable de hechos contables
 * de nóminas (`employee_payroll_facts`).
 *
 * Garantiza la atomicidad mediante RPC PostgreSQL (`record_payroll_fact_atomic`) o
 * fallback directo por tabla con auditoría (versionado N+1).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  InsertEmployeePayrollFactDTO,
  SettlementType,
} from '../../types/payroll-facts.ts';

export type WriteFactResult = {
  success: boolean;
  factId: string;
  version: number;
  supersededFactId?: string;
  error?: string;
};

export class PayrollFactWriteModel {
  constructor(private readonly supabase: SupabaseClient) {}



  /**
   * Sustituye transaccionalmente un mes completo.
   * Invalida los activos anteriores y escribe los nuevos en una sola transacción.
   */
  async replaceMonthAtomic(periodYm: string, facts: InsertEmployeePayrollFactDTO[]): Promise<{ success: boolean; insertedCount?: number; error?: string }> {
    const { data, error } = await this.supabase.rpc('replace_payroll_month_atomic', {
      p_period_ym: periodYm,
      p_facts: facts,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    const payload = data as { success: boolean; inserted_count?: number; error?: string };
    if (!payload.success) {
      return { success: false, error: payload.error };
    }

    return { success: true, insertedCount: payload.inserted_count };
  }
}
