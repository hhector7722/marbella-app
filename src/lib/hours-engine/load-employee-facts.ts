/**
 * Carga hechos de frontera + tramos versionados desde Supabase.
 * No usa profiles.contracted_hours_weekly / prefer_stock / is_fixed / role / OT rate.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  employeeFactsFromContractTerms,
  type ContractTermRow,
} from './ui-bridge.ts';
import type { EmployeeBoundaryFacts } from './types.ts';

type ProfilesBoundary = {
  joining_date: string | null;
  end_date: string | null;
};

/**
 * Fuente contractual = hours_contract_terms.
 * joining_date / end_date = hechos de frontera en profiles (no jornada/régimen).
 */
export async function loadEmployeeBoundaryFacts(
  supabase: SupabaseClient,
  userId: string,
): Promise<EmployeeBoundaryFacts> {
  const [boundaryRes, termsRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('joining_date, end_date')
      .eq('id', userId)
      .maybeSingle(),
    supabase
      .from('hours_contract_terms')
      .select(
        'effective_from, effective_to, weekly_hours, bag_mode, regime, overtime_rate_per_hour',
      )
      .eq('user_id', userId)
      .order('effective_from', { ascending: true }),
  ]);

  if (boundaryRes.error) {
    throw new Error(`No se pudo cargar frontera laboral: ${boundaryRes.error.message}`);
  }
  if (termsRes.error) {
    throw new Error(`No se pudieron cargar tramos contractuales: ${termsRes.error.message}`);
  }

  const boundary = (boundaryRes.data ?? {
    joining_date: null,
    end_date: null,
  }) as ProfilesBoundary;

  const rows = (termsRes.data ?? []) as ContractTermRow[];
  if (rows.length === 0) {
    throw new Error(
      `Empleado ${userId} sin tramos en hours_contract_terms. Ejecutar seed/migración.`,
    );
  }

  return employeeFactsFromContractTerms(
    {
      id: userId,
      joining_date: boundary.joining_date,
      end_date: boundary.end_date,
    },
    rows,
  );
}
