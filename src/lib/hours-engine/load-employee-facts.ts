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

type BoundaryProfileRow = ProfilesBoundary & { id: string };

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

/**
 * Carga los hechos de frontera de varios empleados en dos consultas totales.
 * Mantiene la misma semántica que loadEmployeeBoundaryFacts(): si falta un tramo
 * contractual para cualquier empleado, la operación en lote falla y el consumidor
 * puede aplicar el mismo fallback individual que antes.
 */
export async function loadEmployeeBoundaryFactsBatch(
  supabase: SupabaseClient,
  userIds: string[],
): Promise<Record<string, EmployeeBoundaryFacts>> {
  if (userIds.length === 0) return {};

  const [profilesRes, termsRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, joining_date, end_date')
      .in('id', userIds),
    supabase
      .from('hours_contract_terms')
      .select(
        'user_id, effective_from, effective_to, weekly_hours, bag_mode, regime, overtime_rate_per_hour',
      )
      .in('user_id', userIds)
      .order('effective_from', { ascending: true }),
  ]);

  if (profilesRes.error) {
    throw new Error(`No se pudo cargar frontera laboral en lote: ${profilesRes.error.message}`);
  }
  if (termsRes.error) {
    throw new Error(`No se pudieron cargar tramos contractuales en lote: ${termsRes.error.message}`);
  }

  const profilesById = new Map(
    ((profilesRes.data ?? []) as BoundaryProfileRow[]).map((row) => [row.id, row]),
  );
  const termsByUserId = new Map<string, ContractTermRow[]>();

  for (const row of (termsRes.data ?? []) as Array<ContractTermRow & { user_id: string }>) {
    const rows = termsByUserId.get(row.user_id) ?? [];
    rows.push(row);
    termsByUserId.set(row.user_id, rows);
  }

  const result: Record<string, EmployeeBoundaryFacts> = {};
  for (const userId of userIds) {
    const profile = profilesById.get(userId) ?? {
      id: userId,
      joining_date: null,
      end_date: null,
    };
    const rows = termsByUserId.get(userId) ?? [];

    if (rows.length === 0) {
      throw new Error(
        `Empleado ${userId} sin tramos en hours_contract_terms. Ejecutar seed/migración.`,
      );
    }

    result[userId] = employeeFactsFromContractTerms(
      {
        id: userId,
        joining_date: profile.joining_date,
        end_date: profile.end_date,
      },
      rows,
    );
  }

  return result;
}
