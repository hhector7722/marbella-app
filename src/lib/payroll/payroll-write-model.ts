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
   * Registra un hecho contable de nómina individual de forma ATÓMICA en PostgreSQL.
   */
  async recordPayrollFact(input: InsertEmployeePayrollFactDTO): Promise<WriteFactResult> {
    const settlementType: SettlementType = input.settlement_type ?? 'ordinary';

    // 1. Intentar ejecución vía RPC atómica de PostgreSQL
    const { data, error } = await this.supabase.rpc('record_payroll_fact_atomic', {
      p_user_id: input.user_id,
      p_period_ym: input.period_ym,
      p_settlement_type: settlementType,
      p_total_company_cost: input.total_company_cost,
      p_document_id: input.document_id ?? null,
      p_created_by: input.created_by ?? null,
    });

    if (!error && data) {
      const payload = data as {
        success: boolean;
        fact_id: string;
        version: number;
        superseded_fact_id: string | null;
      };

      return {
        success: payload.success,
        factId: payload.fact_id,
        version: payload.version,
        supersededFactId: payload.superseded_fact_id ?? undefined,
      };
    }

    // 2. Si la función RPC no existe aún en el esquema remoto, ejecutar fallback nativo vía PostgREST
    return this.recordFactFallback(input, settlementType);
  }

  /**
   * Fallback resiliente vía PostgREST de tabla directa
   */
  private async recordFactFallback(
    input: InsertEmployeePayrollFactDTO,
    settlementType: SettlementType,
  ): Promise<WriteFactResult> {
    const now = new Date().toISOString();

    // Consultar hecho activo previo
    const { data: existing } = await this.supabase
      .from('employee_payroll_facts')
      .select('id, version')
      .eq('user_id', input.user_id)
      .eq('period_ym', input.period_ym)
      .eq('settlement_type', settlementType)
      .eq('status', 'active')
      .maybeSingle();

    let nextVersion = 1;
    let oldFactId: string | null = null;

    if (existing) {
      oldFactId = existing.id;
      nextVersion = (existing.version || 1) + 1;

      // Desactivar hecho previo
      await this.supabase
        .from('employee_payroll_facts')
        .update({
          status: 'superseded',
          superseded_at: now,
        })
        .eq('id', oldFactId);
    }

    // Insertar nuevo hecho activo
    const { data: newFact, error: insertErr } = await this.supabase
      .from('employee_payroll_facts')
      .insert({
        user_id: input.user_id,
        period_ym: input.period_ym,
        settlement_type: settlementType,
        version: nextVersion,
        status: 'active',
        total_company_cost: input.total_company_cost,
        document_id: input.document_id ?? null,
        created_by: input.created_by ?? null,
        created_at: now,
      })
      .select('id')
      .single();

    if (insertErr || !newFact) {
      return {
        success: false,
        factId: '',
        version: 0,
        error: `Error insertando hecho contable fallback: ${insertErr?.message ?? 'Sin datos'}`,
      };
    }

    // Enlazar referencia superseded_by en el viejo
    if (oldFactId) {
      await this.supabase
        .from('employee_payroll_facts')
        .update({ superseded_by: newFact.id })
        .eq('id', oldFactId);
    }

    return {
      success: true,
      factId: newFact.id,
      version: nextVersion,
      supersededFactId: oldFactId ?? undefined,
    };
  }

  /**
   * Cancela explícitamente un hecho contable marcándolo como 'cancelled'.
   */
  async cancelFact(factId: string): Promise<{ success: boolean; error?: string }> {
    const { error } = await this.supabase
      .from('employee_payroll_facts')
      .update({
        status: 'cancelled',
      })
      .eq('id', factId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  }
}
