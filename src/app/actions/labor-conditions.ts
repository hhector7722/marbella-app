'use server';

import { createClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';
import { isMasterDashboardUser } from '@/lib/master-dashboard';
import { formatYmdInMadrid } from '@/lib/madrid-date-bounds';
import {
  mapContractTermRows,
  persistContractualChange,
  persistTermBoundsReschedule,
  persistTermDeletion,
  recalcSnapshotsAndPersistOvertimeCost,
  type ContractTermFact,
  type ContractTermRow,
} from '@/lib/hours-engine';
import {
  laborChangeIsNoopAt,
  openTermSnapshot,
  parseCivilYmd,
  snapshotToProfileMirror,
  validateLaborConditionsForm,
  type LaborConditionsFormInput,
} from '@/lib/hours-engine/labor-conditions';

export type LaborTermDto = {
  effectiveFrom: string;
  effectiveTo: string | null;
  weeklyHours: number;
  bagMode: boolean;
  regime: string;
  overtimeRatePerHour: number | null;
};

async function requireHectorSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email || !isMasterDashboardUser(user.email)) {
    return { ok: false as const, error: 'Acceso denegado', supabase: null, user: null };
  }
  return { ok: true as const, error: null, supabase, user };
}

export async function canManageLaborConditions(): Promise<boolean> {
  const gate = await requireHectorSession();
  return gate.ok;
}

export async function getEmployeeLaborConditions(employeeId: string): Promise<{
  success: boolean;
  error?: string;
  employeeName?: string;
  terms?: LaborTermDto[];
}> {
  const gate = await requireHectorSession();
  if (!gate.ok || !gate.supabase) {
    return { success: false, error: gate.error ?? 'Acceso denegado' };
  }

  const supabase = gate.supabase;
  const id = String(employeeId || '').trim();
  if (!id) return { success: false, error: 'Empleado no indicado' };

  const [{ data: profile, error: profileErr }, { data: rows, error: termsErr }] =
    await Promise.all([
      supabase
        .from('profiles')
        .select('first_name, last_name')
        .eq('id', id)
        .maybeSingle(),
      supabase
        .from('hours_contract_terms')
        .select(
          'effective_from, effective_to, weekly_hours, bag_mode, regime, overtime_rate_per_hour',
        )
        .eq('user_id', id)
        .order('effective_from', { ascending: false }),
    ]);

  if (profileErr) return { success: false, error: profileErr.message };
  if (!profile) return { success: false, error: 'Empleado no encontrado' };
  if (termsErr) return { success: false, error: termsErr.message };

  const terms = mapContractTermRows((rows ?? []) as ContractTermRow[]).map((t) => ({
    effectiveFrom: t.effectiveFrom,
    effectiveTo: t.effectiveTo,
    weeklyHours: t.weeklyHours,
    bagMode: t.bagMode,
    regime: t.regime,
    overtimeRatePerHour: t.overtimeRatePerHour ?? null,
  }));

  return {
    success: true,
    employeeName: `${profile.first_name} ${profile.last_name || ''}`.trim(),
    terms,
  };
}

function civilDatesEqual(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const na = a == null || String(a).trim() === '' ? null : String(a).trim();
  const nb = b == null || String(b).trim() === '' ? null : String(b).trim();
  return na === nb;
}

/**
 * Regenera weekly_snapshots SQL tras un cambio contractual y persiste total_cost
 * desde Overtime Cost Engine (TS). HE no necesita paso aparte de horas.
 */
async function propagateSnapshotsAfterContractChange(
  supabase: Awaited<ReturnType<typeof createClient>>,
  employeeId: string,
  startDate: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await recalcSnapshotsAndPersistOvertimeCost(
    supabase,
    employeeId,
    startDate,
  );
  if (!result.ok) {
    return {
      ok: false,
      error: `Contrato guardado, pero falló el recálculo/persistencia de coste: ${result.error}`,
    };
  }
  return { ok: true };
}

/**
 * Cambia condiciones laborales.
 *
 * - Con `originalEffectiveFrom` (editar tramo): **siempre** reescribe ese tramo
 *   in-place (o reprograma fechas + vecinos). Nunca parte/crea tramos nuevos.
 * - Sin original (nueva vigencia): splice histórico desde `effectiveFrom`.
 */
export async function updateLaborConditions(
  employeeId: string,
  form: LaborConditionsFormInput,
): Promise<{ success: boolean; error?: string; kind?: string; message?: string }> {
  const gate = await requireHectorSession();
  if (!gate.ok || !gate.supabase) {
    return { success: false, error: gate.error ?? 'Acceso denegado' };
  }

  const supabase = gate.supabase;
  const id = String(employeeId || '').trim();
  if (!id) return { success: false, error: 'Empleado no indicado' };

  const validated = validateLaborConditionsForm(form);
  if (!validated.ok) return { success: false, error: validated.error };

  const todayMadrid = formatYmdInMadrid(new Date());
  if (!todayMadrid) {
    return { success: false, error: 'No se pudo determinar la fecha de hoy (Madrid)' };
  }

  const effectiveFrom =
    form.effectiveFrom != null && String(form.effectiveFrom).trim() !== ''
      ? parseCivilYmd(String(form.effectiveFrom))
      : todayMadrid;

  if (!effectiveFrom) {
    return { success: false, error: 'Fecha efectiva no válida' };
  }

  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', id)
    .maybeSingle();

  if (profileErr) return { success: false, error: profileErr.message };
  if (!profile) return { success: false, error: 'Empleado no encontrado' };

  const { data: termRows, error: loadErr } = await supabase
    .from('hours_contract_terms')
    .select(
      'effective_from, effective_to, weekly_hours, bag_mode, regime, overtime_rate_per_hour',
    )
    .eq('user_id', id)
    .order('effective_from', { ascending: true });

  if (loadErr) return { success: false, error: loadErr.message };

  const currentTerms = mapContractTermRows((termRows ?? []) as ContractTermRow[]);

  const originalFromRaw =
    form.originalEffectiveFrom != null && String(form.originalEffectiveFrom).trim() !== ''
      ? parseCivilYmd(String(form.originalEffectiveFrom))
      : null;

  // Edición de tramo existente: in-place / reschedule (NUNCA splice → tramo nuevo)
  if (originalFromRaw) {
    const rawTo =
      form.effectiveTo == null || String(form.effectiveTo).trim() === ''
        ? null
        : parseCivilYmd(String(form.effectiveTo));
    if (
      form.effectiveTo != null &&
      String(form.effectiveTo).trim() !== '' &&
      rawTo === null
    ) {
      return { success: false, error: 'Fecha de finalización no válida' };
    }

    let plan: { kind: string; terms: readonly ContractTermFact[] };
    try {
      plan = await persistTermBoundsReschedule(
        supabase,
        id,
        originalFromRaw,
        effectiveFrom,
        rawTo,
        validated.snapshot,
      );
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : 'Error al actualizar el tramo contractual';
      return { success: false, error: msg };
    }

    if (plan.kind === 'noop') {
      return {
        success: true,
        kind: 'noop',
        message: 'No hay cambios en este tramo',
      };
    }

    const openSnap = openTermSnapshot(plan.terms) ?? validated.snapshot;
    const mirror = snapshotToProfileMirror(openSnap, profile.role ?? 'staff');
    const sortedPlan = [...plan.terms].sort((a, b) =>
      a.effectiveFrom.localeCompare(b.effectiveFrom),
    );
    const firstFrom = sortedPlan[0]?.effectiveFrom;
    const lastTerm = sortedPlan.at(-1);
    const prevLast = [...currentTerms]
      .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))
      .at(-1);
    const profilePatch: Record<string, unknown> = { ...mirror };
    if (firstFrom) {
      profilePatch.joining_date = firstFrom;
    }
    if (
      lastTerm &&
      prevLast &&
      !civilDatesEqual(prevLast.effectiveTo, lastTerm.effectiveTo)
    ) {
      profilePatch.end_date = lastTerm.effectiveTo;
    }
    const { error: updErr } = await supabase
      .from('profiles')
      .update(profilePatch)
      .eq('id', id);
    if (updErr) {
      return {
        success: false,
        error: `Contrato actualizado, pero falló al actualizar el perfil: ${updErr.message}`,
      };
    }

    const recalcFrom = firstFrom ?? effectiveFrom ?? todayMadrid;
    const prop = await propagateSnapshotsAfterContractChange(supabase, id, recalcFrom);
    if (!prop.ok) {
      return { success: false, error: prop.error };
    }

    revalidatePath('/profile');
    revalidatePath('/profile/contrato');
    revalidatePath('/staff/history');
    revalidatePath('/dashboard');

    return { success: true, kind: plan.kind };
  }

  if (laborChangeIsNoopAt(currentTerms, validated.snapshot, effectiveFrom)) {
    return {
      success: true,
      kind: 'noop',
      message: 'No hay cambios respecto a las condiciones de esa fecha',
    };
  }

  let plan: { kind: string; terms: readonly ContractTermFact[] };
  try {
    plan = await persistContractualChange(
      supabase,
      id,
      validated.snapshot,
      effectiveFrom,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error al versionar el contrato';
    return { success: false, error: msg };
  }

  if (plan.kind === 'noop') {
    return {
      success: true,
      kind: 'noop',
      message: 'No hay cambios respecto a las condiciones de esa fecha',
    };
  }

  const openSnap = openTermSnapshot(plan.terms) ?? validated.snapshot;
  const mirror = snapshotToProfileMirror(openSnap, profile.role ?? 'staff');
  const { error: updErr } = await supabase.from('profiles').update(mirror).eq('id', id);
  if (updErr) {
    return {
      success: false,
      error: `Contrato versionado, pero falló al actualizar el perfil: ${updErr.message}`,
    };
  }

  const prop = await propagateSnapshotsAfterContractChange(supabase, id, effectiveFrom);
  if (!prop.ok) {
    return { success: false, error: prop.error };
  }

  revalidatePath('/profile');
  revalidatePath('/profile/contrato');
  revalidatePath('/staff/history');
  revalidatePath('/dashboard');

  return { success: true, kind: plan.kind };
}

/**
 * Elimina un tramo del histórico. El anterior absorbe el rango (sin huecos).
 * No permite borrar el único tramo. Recalcula snapshots desde el primer tramo.
 */
export async function deleteLaborTerm(
  employeeId: string,
  termEffectiveFrom: string,
): Promise<{ success: boolean; error?: string; kind?: string }> {
  const gate = await requireHectorSession();
  if (!gate.ok || !gate.supabase) {
    return { success: false, error: gate.error ?? 'Acceso denegado' };
  }

  const supabase = gate.supabase;
  const id = String(employeeId || '').trim();
  if (!id) return { success: false, error: 'Empleado no indicado' };

  const from = parseCivilYmd(String(termEffectiveFrom || ''));
  if (!from) return { success: false, error: 'Fecha de inicio del tramo no válida' };

  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', id)
    .maybeSingle();

  if (profileErr) return { success: false, error: profileErr.message };
  if (!profile) return { success: false, error: 'Empleado no encontrado' };

  const { data: termRows, error: loadErr } = await supabase
    .from('hours_contract_terms')
    .select(
      'effective_from, effective_to, weekly_hours, bag_mode, regime, overtime_rate_per_hour',
    )
    .eq('user_id', id)
    .order('effective_from', { ascending: true });

  if (loadErr) return { success: false, error: loadErr.message };

  const currentTerms = mapContractTermRows((termRows ?? []) as ContractTermRow[]);
  if (currentTerms.length === 0) {
    return { success: false, error: 'No hay tramos que eliminar' };
  }

  let plan: { kind: string; terms: readonly ContractTermFact[] };
  try {
    plan = await persistTermDeletion(supabase, id, from);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error al eliminar el tramo';
    return { success: false, error: msg };
  }

  const openSnap = openTermSnapshot(plan.terms);
  if (!openSnap && plan.terms.length === 0) {
    return { success: false, error: 'El trabajador quedaría sin contrato' };
  }

  const sortedPlan = [...plan.terms].sort((a, b) =>
    a.effectiveFrom.localeCompare(b.effectiveFrom),
  );
  const firstFrom = sortedPlan[0]?.effectiveFrom;
  const lastTerm = sortedPlan.at(-1);
  const prevLast = [...currentTerms]
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))
    .at(-1);

  const mirror = openSnap
    ? snapshotToProfileMirror(openSnap, profile.role ?? 'staff')
    : snapshotToProfileMirror(
        {
          weeklyHours: lastTerm!.weeklyHours,
          bagMode: lastTerm!.bagMode,
          regime: lastTerm!.regime,
          overtimeRatePerHour: lastTerm!.overtimeRatePerHour ?? null,
        },
        profile.role ?? 'staff',
      );

  const profilePatch: Record<string, unknown> = { ...mirror };
  if (firstFrom) {
    profilePatch.joining_date = firstFrom;
  }
  if (
    lastTerm &&
    prevLast &&
    !civilDatesEqual(prevLast.effectiveTo, lastTerm.effectiveTo)
  ) {
    profilePatch.end_date = lastTerm.effectiveTo;
  }

  const { error: updErr } = await supabase
    .from('profiles')
    .update(profilePatch)
    .eq('id', id);
  if (updErr) {
    return {
      success: false,
      error: `Tramo eliminado, pero falló al actualizar el perfil: ${updErr.message}`,
    };
  }

  const recalcFrom =
    firstFrom ??
    formatYmdInMadrid(new Date()) ??
    from;
  const prop = await propagateSnapshotsAfterContractChange(supabase, id, recalcFrom);
  if (!prop.ok) {
    return { success: false, error: prop.error };
  }

  revalidatePath('/profile');
  revalidatePath('/profile/contrato');
  revalidatePath('/staff/history');
  revalidatePath('/dashboard');

  return { success: true, kind: plan.kind };
}
