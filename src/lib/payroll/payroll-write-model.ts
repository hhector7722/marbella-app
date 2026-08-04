/**
 * Write Model de Payroll SSOT (FASE 2 - Atómico PostgreSQL).
 *
 * Exclusivamente encargado de la persistencia e ingesta inmutable de hechos contables
 * de nóminas (`employee_payroll_facts`).
 *
 * Garantiza la atomicidad absoluta de la transacción en PostgreSQL mediante la RPC:
 * `record_payroll_fact_atomic` (FOR UPDATE + Insert Version N+1 + Update Superseded).
 *
 * Cero lógica de lectura, cero consumo del Dashboard, cero dependencia del Hours Engine.
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
   * Registra un hecho contable de nómina individual de forma estrictamente ATÓMICA en PostgreSQL.
   *
   * Ejecuta una única transacción ACID en PostgreSQL via RPC (`record_payroll_fact_atomic`) que:
   * 1. Aplica un bloqueo a nivel de fila (`FOR UPDATE`) para evitar race conditions.
   * 2. Inactiva el registro activo previo marcándolo como `superseded`.
   * 3. Incrementa la versión a N + 1.
   * 4. Inserta el nuevo registro como `active`.
   * 5. Enlaza `superseded_by` con la ID del nuevo hecho (Audit Ledger).
   * 6. Ejecuta un ROLLBACK atómico en PostgreSQL si cualquier paso o constraint falla.
   */
  async recordPayrollFact(input: InsertEmployeePayrollFactDTO): Promise<WriteFactResult> {
    const settlementType: SettlementType = input.settlement_type ?? 'ordinary';

    const { data, error } = await this.supabase.rpc('record_payroll_fact_atomic', {
      p_user_id: input.user_id,
      p_period_ym: input.period_ym,
      p_settlement_type: settlementType,
      p_total_company_cost: input.total_company_cost,
      p_document_id: input.document_id ?? null,
      p_created_by: input.created_by ?? null,
    });

    if (error || !data) {
      return {
        success: false,
        factId: '',
        version: 0,
        error: `Error transaccional en BD al registrar hecho contable: ${error?.message ?? 'Sin respuesta'}`,
      };
    }

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
