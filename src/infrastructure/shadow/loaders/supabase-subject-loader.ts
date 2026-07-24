/**
 * Subject loader real (Employee × Week) vía Supabase.
 * Implementa ShadowSubjectLoader — el dominio no conoce este módulo.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  filterVisiblePlantillaEmployees,
  type PlantillaEmployeeRow,
} from '../../../lib/staff/plantilla-employees.ts';
import type {
  ShadowSubject,
  ShadowSubjectLoader,
} from '../../../lib/shadow/runner/ports.ts';
import type { CivilDate } from '../../../lib/hours-engine/types.ts';

export type SupabaseShadowSubjectLoaderOptions = {
  weekStarts: readonly CivilDate[];
  /** UUID(s) de empleado; vacío = plantilla visible. */
  employeeIds?: readonly string[];
  /** Tope de sujetos Employee×Week tras el producto cartesiano. */
  limit?: number;
};

type ProfileRow = PlantillaEmployeeRow & {
  prefer_stock_hours?: boolean | null;
};

export async function listShadowEmployeeIds(
  client: SupabaseClient,
  employeeIds?: readonly string[],
): Promise<string[]> {
  if (employeeIds && employeeIds.length > 0) {
    return [...employeeIds];
  }

  const { data, error } = await client
    .from('profiles')
    .select('id, first_name, last_name, visible_in_plantilla, end_date')
    .order('last_name', { ascending: true });

  if (error) {
    throw new Error(`No se pudieron listar empleados: ${error.message}`);
  }

  const visible = filterVisiblePlantillaEmployees(
    (data ?? []) as ProfileRow[],
  );
  return visible.map((p) => p.id);
}

export function buildSubjectsCartesian(
  employeeIds: readonly string[],
  weekStarts: readonly CivilDate[],
  limit?: number,
): ShadowSubject[] {
  const subjects: ShadowSubject[] = [];
  for (const employeeId of employeeIds) {
    for (const weekStart of weekStarts) {
      subjects.push({ employeeId, weekStart });
      if (limit !== undefined && subjects.length >= limit) {
        return subjects;
      }
    }
  }
  return subjects;
}

export function createSupabaseShadowSubjectLoader(
  client: SupabaseClient,
  options: SupabaseShadowSubjectLoaderOptions,
): ShadowSubjectLoader {
  let cached: readonly ShadowSubject[] | null = null;

  return {
    async listSubjects() {
      if (cached) return cached;
      const employeeIds = await listShadowEmployeeIds(
        client,
        options.employeeIds,
      );
      cached = buildSubjectsCartesian(
        employeeIds,
        options.weekStarts,
        options.limit,
      );
      return cached;
    },
  };
}
