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

  async recordPayrollFact(dto: InsertEmployeePayrollFactDTO): Promise<WriteFactResult> {
    const { data, error } = await this.supabase.rpc('record_payroll_fact_atomic', {
      p_user_id: dto.user_id,
      p_period_ym: dto.period_ym,
      p_settlement_type: dto.settlement_type,
      p_total_company_cost: dto.total_company_cost,
      p_document_id: dto.document_id,
      p_created_by: dto.created_by,
      p_settlement_hash: dto.settlement_hash,
    });

    if (error) {
      return { success: false, factId: '', version: 0, error: error.message };
    }

    const payload = data as {
      success: boolean;
      fact_id?: string;
      version?: number;
      superseded_fact_id?: string;
      error?: string;
    };

    if (!payload?.success) {
      return { success: false, factId: '', version: 0, error: payload?.error ?? 'unknown error' };
    }

    return {
      success: true,
      factId: payload.fact_id ?? '',
      version: payload.version ?? 0,
      supersededFactId: payload.superseded_fact_id ?? undefined,
    };
  }
}
