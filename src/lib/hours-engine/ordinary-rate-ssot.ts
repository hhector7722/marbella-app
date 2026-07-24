/**
 * Tarifa ordinaria €/h alineada al SSOT de jornada (hours_contract_terms)
 * y coste mensual en profiles.monthly_cost (espejo laboral, no profile_labor_cost_terms).
 *
 * Misma fórmula que fn_labor_effective_ordinary_rate, pero jornada desde tramos.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  loadEmployeeBoundaryFacts,
  resolveEffectiveContract,
} from '@/lib/hours-engine';
import { mondayOnOrBefore } from '@/lib/hours-engine/week-dates';

export async function ordinaryHourlyRateFromSsot(
  supabase: SupabaseClient,
  userId: string,
  onDateYmd: string,
): Promise<number> {
  const day = onDateYmd.split('T')[0]!;
  let employee;
  try {
    employee = await loadEmployeeBoundaryFacts(supabase, userId);
  } catch {
    return 0;
  }

  const weekStart = mondayOnOrBefore(day);
  const contract = resolveEffectiveContract(employee, weekStart);
  // Jornada de referencia: primer tramo de la semana con horas > 0, si no suma efectiva
  let weeklyHours = contract.contractedHoursEffective;
  for (const seg of contract.segments) {
    if (seg.kind === 'term' && seg.weeklyHoursOfTerm > 0) {
      weeklyHours = seg.weeklyHoursOfTerm;
      break;
    }
  }
  if (weeklyHours <= 0) weeklyHours = 40;

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('monthly_cost')
    .eq('id', userId)
    .maybeSingle();
  if (error) return 0;
  const monthly = Number(profile?.monthly_cost) || 0;
  if (monthly <= 0) return 0;

  const denom = weeklyHours * (52 / 12) * 0.85;
  if (denom <= 0) return 0;
  return monthly / denom;
}
