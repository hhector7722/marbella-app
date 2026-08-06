/**
 * Persistencia de tramos: aplica el planificador puro (splice) sobre hours_contract_terms.
 * Única vía TS recomendada (además del trigger SQL en profiles).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  applyContractualChange,
  rewriteHistoricalTerm,
  rescheduleTermBounds,
  rescheduleTermStart,
  deleteContractTerm,
  type ContractualSnapshot,
} from './contract-terms-versioning.ts';
import { mapContractTermRows, type ContractTermRow } from './ui-bridge.ts';
import type { CivilDate, ContractTermFact } from './types.ts';

async function loadTerms(
  supabase: SupabaseClient,
  userId: string,
): Promise<ContractTermFact[]> {
  const { data, error } = await supabase
    .from('hours_contract_terms')
    .select(
      'effective_from, effective_to, weekly_hours, bag_mode, regime, overtime_rate_per_hour',
    )
    .eq('user_id', userId)
    .order('effective_from', { ascending: true });

  if (error) {
    throw new Error(`No se pudieron leer tramos: ${error.message}`);
  }
  return mapContractTermRows((data ?? []) as ContractTermRow[]);
}

async function replaceAllTerms(
  supabase: SupabaseClient,
  userId: string,
  terms: readonly ContractTermFact[],
): Promise<void> {
  const { error: delErr } = await supabase
    .from('hours_contract_terms')
    .delete()
    .eq('user_id', userId);
  if (delErr) {
    throw new Error(`No se pudieron limpiar tramos: ${delErr.message}`);
  }

  if (terms.length === 0) return;

  const rows = terms.map((t) => ({
    user_id: userId,
    effective_from: t.effectiveFrom,
    effective_to: t.effectiveTo,
    weekly_hours: t.weeklyHours,
    bag_mode: t.bagMode,
    regime: t.regime,
    overtime_rate_per_hour: t.overtimeRatePerHour ?? null,
  }));

  const { error: insErr } = await supabase.from('hours_contract_terms').insert(rows);
  if (insErr) {
    throw new Error(`No se pudieron insertar tramos: ${insErr.message}`);
  }
}

/**
 * Aplica cambio contractual versionado (fecha efectiva = Madrid hoy si no se pasa).
 * Abort si rompe invariantes.
 */
export async function persistContractualChange(
  supabase: SupabaseClient,
  userId: string,
  nextSnapshot: ContractualSnapshot,
  effectiveFrom: CivilDate,
): Promise<{ kind: string; terms: readonly ContractTermFact[] }> {
  const current = await loadTerms(supabase, userId);
  const plan = applyContractualChange(current, nextSnapshot, effectiveFrom);
  if (plan.kind === 'noop') {
    return plan;
  }
  await replaceAllTerms(supabase, userId, plan.terms);
  return plan;
}

export async function persistHistoricalTermRewrite(
  supabase: SupabaseClient,
  userId: string,
  termEffectiveFrom: CivilDate,
  nextSnapshot: ContractualSnapshot,
): Promise<{ kind: string; terms: readonly ContractTermFact[] }> {
  const current = await loadTerms(supabase, userId);
  const plan = rewriteHistoricalTerm(current, termEffectiveFrom, nextSnapshot);
  if (plan.kind === 'noop') {
    return plan;
  }
  await replaceAllTerms(supabase, userId, plan.terms);
  return plan;
}

/**
 * Mueve el inicio de un tramo (recalcula el anterior) y aplica condiciones.
 */
export async function persistTermReschedule(
  supabase: SupabaseClient,
  userId: string,
  originalFrom: CivilDate,
  newFrom: CivilDate,
  nextSnapshot: ContractualSnapshot,
): Promise<{ kind: string; terms: readonly ContractTermFact[] }> {
  const current = await loadTerms(supabase, userId);
  const plan = rescheduleTermStart(current, originalFrom, newFrom, nextSnapshot);
  if (plan.kind === 'noop') {
    return plan;
  }
  await replaceAllTerms(supabase, userId, plan.terms);
  return plan;
}

/**
 * Mueve inicio y/o fin de un tramo (recalcula vecinos) y aplica condiciones.
 */
export async function persistTermBoundsReschedule(
  supabase: SupabaseClient,
  userId: string,
  originalFrom: CivilDate,
  newFrom: CivilDate,
  newTo: CivilDate | null,
  nextSnapshot: ContractualSnapshot,
): Promise<{ kind: string; terms: readonly ContractTermFact[] }> {
  const current = await loadTerms(supabase, userId);
  const plan = rescheduleTermBounds(
    current,
    originalFrom,
    newFrom,
    newTo,
    nextSnapshot,
  );
  if (plan.kind === 'noop') {
    return plan;
  }
  await replaceAllTerms(supabase, userId, plan.terms);
  return plan;
}

/**
 * Elimina un tramo (deja un hueco). No permite borrar el único.
 */
export async function persistTermDeletion(
  supabase: SupabaseClient,
  userId: string,
  termEffectiveFrom: CivilDate,
): Promise<{ kind: string; terms: readonly ContractTermFact[] }> {
  const current = await loadTerms(supabase, userId);
  const plan = deleteContractTerm(current, termEffectiveFrom);
  await replaceAllTerms(supabase, userId, plan.terms);
  return plan;
}
