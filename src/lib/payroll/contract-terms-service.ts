/**
 * ContractTermsService (FASE 10 - Batch Loading Cierre definitivo).
 *
 * Encapsula la fuente única de verdad contractual (`hours_contract_terms`).
 * Soporta carga masiva en lote (Batch Loading) con evaluación 100% en memoria
 * para garantizar la regla de 1 ÚNICA consulta SQL por mes.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type ContractTermBoundaryRow = {
  user_id: string;
  effective_from: string;
  effective_to: string | null;
};

/**
 * Almacén en memoria de tramos contractuales para evaluación sincrónica sin I/O.
 */
export class ContractTermsStore {
  constructor(private readonly terms: ContractTermBoundaryRow[]) {}

  isContractActiveOn(userId: string, dateYmd: string): boolean {
    const day = dateYmd.split('T')[0]!;
    const userTerms = this.terms.filter((t) => t.user_id === userId);
    return userTerms.some((t) => {
      const from = t.effective_from.split('T')[0]!;
      const to = t.effective_to ? t.effective_to.split('T')[0]! : '9999-12-31';
      return day >= from && day <= to;
    });
  }

  getActiveContractDays(userId: string, periodYm: string): number {
    const monthDays = ContractTermsService.listMonthDays(periodYm);
    const userTerms = this.terms.filter((t) => t.user_id === userId);
    if (userTerms.length === 0) return 0;

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
    return activeDaysCount;
  }
}

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
   * Carga en LOTE (1 sola consulta SQL) todos los tramos de contrato de los usuarios para el mes.
   */
  async loadTermsForMonth(userIds: string[], periodYm: string): Promise<ContractTermsStore> {
    if (userIds.length === 0) return new ContractTermsStore([]);

    const monthDays = ContractTermsService.listMonthDays(periodYm);
    if (monthDays.length === 0) return new ContractTermsStore([]);

    const monthEnd = monthDays[monthDays.length - 1]!;

    const { data: terms, error } = await this.supabase
      .from('hours_contract_terms')
      .select('user_id, effective_from, effective_to')
      .in('user_id', userIds)
      .lte('effective_from', monthEnd);

    if (error) {
      throw new Error(`Error en ContractTermsService.loadTermsForMonth: ${error.message}`);
    }

    return new ContractTermsStore((terms ?? []) as ContractTermBoundaryRow[]);
  }

  /**
   * Calcula D_vigentes: número de días naturales del mes en los que el contrato estuvo realmente vigente.
   */
  async getActiveContractDays(userId: string, periodYm: string): Promise<number> {
    const store = await this.loadTermsForMonth([userId], periodYm);
    return store.getActiveContractDays(userId, periodYm);
  }

  /**
   * Obtiene en lote el número de días de contrato vigentes (D_vigentes) para múltiples usuarios en un mes.
   */
  async getActiveContractDaysBatch(
    userIds: string[],
    periodYm: string,
  ): Promise<Record<string, number>> {
    const store = await this.loadTermsForMonth(userIds, periodYm);
    const result: Record<string, number> = {};
    for (const id of userIds) {
      result[id] = store.getActiveContractDays(id, periodYm);
    }
    return result;
  }

  /**
   * Verifica en memoria si un usuario tenía contrato vigente en una fecha concreta.
   */
  async isContractActiveOn(userId: string, dateYmd: string): Promise<boolean> {
    const periodYm = dateYmd.substring(0, 7);
    const store = await this.loadTermsForMonth([userId], periodYm);
    return store.isContractActiveOn(userId, dateYmd);
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
