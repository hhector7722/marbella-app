/**
 * PayrollFactRepository (FASE 3).
 *
 * Repositorio de lectura de hecho contable SSOT (`employee_payroll_facts`).
 * Proporciona métodos de acceso a datos sin lógica de negocio.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { EmployeePayrollFactRow } from '../../types/payroll-facts.ts';
import { Money } from './value-objects.ts';

export class PayrollFactRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  /**
   * Obtiene todos los hechos contables activos ('active') para un periodo YYYY-MM.
   */
  async getActiveFactsForPeriod(periodYm: string): Promise<EmployeePayrollFactRow[]> {
    const { data, error } = await this.supabase
      .from('employee_payroll_facts')
      .select('*')
      .eq('period_ym', periodYm)
      .eq('status', 'active');

    if (error) {
      throw new Error(`Error en PayrollFactRepository.getActiveFactsForPeriod: ${error.message}`);
    }

    return (data ?? []) as EmployeePayrollFactRow[];
  }

  /**
   * Obtiene todos los hechos contables activos ('active') de un usuario en un periodo YYYY-MM.
   */
  async getActiveFactsForUser(userId: string, periodYm: string): Promise<EmployeePayrollFactRow[]> {
    const { data, error } = await this.supabase
      .from('employee_payroll_facts')
      .select('*')
      .eq('user_id', userId)
      .eq('period_ym', periodYm)
      .eq('status', 'active');

    if (error) {
      throw new Error(`Error en PayrollFactRepository.getActiveFactsForUser: ${error.message}`);
    }

    return (data ?? []) as EmployeePayrollFactRow[];
  }

  /**
   * Obtiene el coste empresa mensual consolidado (suma de liquidaciones ordinarias, complementarias, finiquitos)
   * devuelto como Value Object `Money`.
   */
  async getMonthlyCompanyCostConsolidated(userId: string, periodYm: string): Promise<Money> {
    const facts = await this.getActiveFactsForUser(userId, periodYm);
    if (facts.length === 0) {
      return Money.zero();
    }
    const total = facts.reduce((sum, f) => sum + Number(f.total_company_cost), 0);
    return Money.from(total);
  }

  /**
   * Obtiene todo el historial de hechos contables (active, superseded, cancelled) para auditoría.
   */
  async getFactHistory(userId: string, periodYm: string): Promise<EmployeePayrollFactRow[]> {
    const { data, error } = await this.supabase
      .from('employee_payroll_facts')
      .select('*')
      .eq('user_id', userId)
      .eq('period_ym', periodYm)
      .order('version', { ascending: true });

    if (error) {
      throw new Error(`Error en PayrollFactRepository.getFactHistory: ${error.message}`);
    }

    return (data ?? []) as EmployeePayrollFactRow[];
  }
}
