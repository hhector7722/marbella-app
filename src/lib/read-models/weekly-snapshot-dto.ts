/**
 * Utilidades de lectura que NO liquidan horas/OT.
 * El DTO de semana (HORAS/PENDIENTES/EXTRAS/IMPORTE) vive en
 * `week-display-from-engine.ts` (Hours Engine + Cost Engine).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Tarifa ordinaria para barra horario: profiles.monthly_cost + tramo del día.
 * Sin liquidateWeek / Cost Engine.
 */
export async function ordinaryHourlyRateFromTerms(
  supabase: SupabaseClient,
  userId: string,
  onDateYmd: string,
): Promise<number> {
  const day = onDateYmd.split('T')[0]!;
  const [{ data: profile }, { data: terms }] = await Promise.all([
    supabase.from('profiles').select('monthly_cost').eq('id', userId).maybeSingle(),
    supabase
      .from('hours_contract_terms')
      .select('effective_from, effective_to, weekly_hours')
      .eq('user_id', userId)
      .order('effective_from', { ascending: true }),
  ]);

  const monthly = Number(profile?.monthly_cost) || 0;
  if (monthly <= 0) return 0;

  let weeklyHours = 40;
  for (const t of terms ?? []) {
    const from = String(t.effective_from).split('T')[0]!;
    const to = t.effective_to ? String(t.effective_to).split('T')[0]! : null;
    if (day < from) continue;
    if (to != null && day > to) continue;
    const wh = Number(t.weekly_hours) || 0;
    if (wh > 0) {
      weeklyHours = wh;
      break;
    }
  }

  const denom = weeklyHours * (52 / 12) * 0.85;
  if (denom <= 0) return 0;
  return monthly / denom;
}

/** @deprecated Eliminado: usar week-display-from-engine (HE). */
export function footerFromSnapshot(_row: unknown): never {
  throw new Error(
    'footerFromSnapshot eliminado: el DTO de semana sale del Hours Engine (week-display-from-engine).',
  );
}
