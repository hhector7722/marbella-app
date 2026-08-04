/**
 * ContractTermsService (FASE 3).
 *
 * Encapsula la fuente única de verdad contractual (`hours_contract_terms`).
 * Calcula los días de contrato vigentes (D_vigentes) dentro de un mes determinado
 * a partir de la unión de tramos activos (`effective_from` y `effective_to`).
 *
 * Ninguna otra clase ni servicio debe conocer o manipular las fechas de vigencia.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { addDays, format, parseISO } from 'date-fns';

export type ContractTermBoundaryRow = {
  user_id: string;
  effective_from: string;
  effective_to: string | null;
};

export class ContractTermsService {
  constructor(private readonly supabase: SupabaseClient) {}

  /**
   * Obtiene la lista de fechas YYYY-MM-DD del mes (ej: '2026-07-01' a '2026-07-31').
   */
  static listMonthDays(periodYm: string): string[] {
    const [y, m] = periodYm.split('-').map(Number);
    if (!y || !m || m < 1 || m > 12) return [];

    const daysInMonth = new Date(y, m, 0).getDate();
    const out: string[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const mm = String(m).padStart(2, '0');
      const dd = String(d).padStart(2, '0');
      out.push(`${y}-${mm}-${dd}`);
    }
    return out;
  }

  /**
   * Calcula D_vigentes: número de días naturales del mes en los que el contrato estuvo realmente vigente.
   */
  async getActiveContractDays(userId: string, periodYm: string): Promise<number> {
    const batchMap = await this.getActiveContractDaysBatch([userId], periodYm);
    return batchMap[userId] ?? 0;
  }

  /**
   * Obtiene en lote el número de días de contrato vigentes (D_vigentes) para múltiples usuarios en un mes.
   */
  async getActiveContractDaysBatch(
    userIds: string[],
    periodYm: string,
  ): Promise<Record<string, number>> {
    if (userIds.length === 0) return {};

    const monthDays = ContractTermsService.listMonthDays(periodYm);
    if (monthDays.length === 0) return {};

    const monthStart = monthDays[0]!;
    const monthEnd = monthDays[monthDays.length - 1]!;

    const { data: terms, error } = await this.supabase
      .from('hours_contract_terms')
      .select('user_id, effective_from, effective_to')
      .in('user_id', userIds)
      .lte('effective_from', monthEnd);

    if (error) {
      throw new Error(`Error en ContractTermsService.getActiveContractDaysBatch: ${error.message}`);
    }

    const rows = (terms ?? []) as ContractTermBoundaryRow[];
    const result: Record<string, number> = {};

    for (const userId of userIds) {
      const userTerms = rows.filter((r) => r.user_id === userId);
      if (userTerms.length === 0) {
        result[userId] = 0;
        continue;
      }

      let activeDaysCount = 0;
      for (const dayYmd of monthDays) {
        const isCovered = userTerms.some((t) => {
          const from = t.effective_from.split('T')[0]!;
          const to = t.effective_to ? t.effective_to.split('T')[0]! : '9999-12-31';
          return dayYmd >= from && dayYmd <= to;
        });

        if (isCovered) {
          activeDaysCount++;
        }
      }
      result[userId] = activeDaysCount;
    }

    return result;
  }

  /**
   * Verifica si un usuario tenía contrato vigente en una fecha concreta.
   */
  async isContractActiveOn(userId: string, dateYmd: string): Promise<boolean> {
    const day = dateYmd.split('T')[0]!;
    const { data, error } = await this.supabase
      .from('hours_contract_terms')
      .select('id')
      .eq('user_id', userId)
      .lte('effective_from', day)
      .or(`effective_to.is.null,effective_to.gte.${day}`);

    if (error) {
      throw new Error(`Error en ContractTermsService.isContractActiveOn: ${error.message}`);
    }

    return (data ?? []).length > 0;
  }

  /**
   * Obtiene la cobertura contractual detallada de un usuario para un mes.
   */
  async getContractCoverage(
    userId: string,
    periodYm: string,
  ): Promise<{ hasCoverage: boolean; activeDays: number; totalMonthDays: number }> {
    const monthDays = ContractTermsService.listMonthDays(periodYm);
    const activeDays = await this.getActiveContractDays(userId, periodYm);
    return {
      hasCoverage: activeDays > 0,
      activeDays,
      totalMonthDays: monthDays.length,
    };
  }
}
