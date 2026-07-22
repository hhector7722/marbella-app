'use server';

import { createClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';
import { isMasterDashboardUser } from '@/lib/master-dashboard';
import { formatYmdInMadrid } from '@/lib/madrid-date-bounds';
import {
  persistContractualChange,
  persistTermBoundsReschedule,
  mapContractTermRows,
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
import type { ContractTermFact } from '@/lib/hours-engine';

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
 * Cambia condiciones laborales (fecha efectiva editable; default hoy Madrid).
 * Versiona hours_contract_terms vía splice; luego espeja profiles con el tramo abierto.
 * En reescritura de tramo: inicio y fin editables (recalcula vecinos).
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

  // Reescritura de tramo: inicio y/o fin pueden moverse
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

    const startChanged = originalFromRaw !== effectiveFrom;
    const endChanged = !civilDatesEqual(
      form.originalEffectiveTo,
      rawTo,
    );

    if (startChanged || endChanged) {
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
          e instanceof Error ? e.message : 'Error al mover las fechas del tramo';
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
      // Solo sincroniza baja si cambia el fin del último tramo
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
          error: `Contrato versionado, pero falló al actualizar el perfil: ${updErr.message}`,
        };
      }

      revalidatePath('/profile');
      revalidatePath('/profile/contrato');
      revalidatePath('/staff/history');
      revalidatePath('/dashboard');

      return { success: true, kind: plan.kind };
    }
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

  // Espejo legacy = tramo abierto tras el plan (puede no coincidir con el splice histórico)
  const openSnap = openTermSnapshot(plan.terms) ?? validated.snapshot;
  const mirror = snapshotToProfileMirror(openSnap, profile.role ?? 'staff');
  const { error: updErr } = await supabase.from('profiles').update(mirror).eq('id', id);
  if (updErr) {
    return {
      success: false,
      error: `Contrato versionado, pero falló al actualizar el perfil: ${updErr.message}`,
    };
  }

  revalidatePath('/profile');
  revalidatePath('/profile/contrato');
  revalidatePath('/staff/history');
  revalidatePath('/dashboard');

  return { success: true, kind: plan.kind };
}
