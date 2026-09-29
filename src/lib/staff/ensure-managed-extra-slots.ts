import { randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { persistContractualChange } from '../hours-engine/persist-contract-terms.ts';
import {
  MANAGED_EXTRA_ACCOUNT_KIND,
  MANAGED_EXTRA_BAN_DURATION,
  MANAGED_EXTRA_IDENTITIES,
  MANAGED_EXTRA_INITIAL_RATE,
  MANAGED_EXTRA_JOINING_DATE,
  MANAGED_EXTRA_WEEKLY_HOURS,
  managedExtraVisibleName,
  type ManagedExtraSlotNumber,
} from './managed-extra-slots.ts';

export type EnsuredManagedExtraSlot = {
  slot: ManagedExtraSlotNumber;
  userId: string;
  created: boolean;
};

export type EnsureManagedExtraSlotsResult =
  | { ok: true; slots: EnsuredManagedExtraSlot[] }
  | { ok: false; error: string };

type AuthAdmin = SupabaseClient['auth']['admin'];

function technicalPassword(): string {
  return randomBytes(32).toString('base64url');
}

async function ensureAuthUser(
  admin: AuthAdmin,
  identity: (typeof MANAGED_EXTRA_IDENTITIES)[number],
): Promise<{ created: boolean } | { error: string }> {
  const existing = await admin.getUserById(identity.userId);
  if (existing.data.user) {
    const metadata = {
      ...(existing.data.user.app_metadata ?? {}),
      account_kind: MANAGED_EXTRA_ACCOUNT_KIND,
      extra_slot: identity.slot,
    };
    const updated = await admin.updateUserById(identity.userId, {
      ban_duration: MANAGED_EXTRA_BAN_DURATION,
      app_metadata: metadata,
    });
    if (updated.error) return { error: updated.error.message };
    return { created: false };
  }

  const password = technicalPassword();
  const created = await admin.createUser({
    id: identity.userId,
    email: identity.email,
    password,
    email_confirm: true,
    app_metadata: {
      account_kind: MANAGED_EXTRA_ACCOUNT_KIND,
      extra_slot: identity.slot,
    },
    ban_duration: MANAGED_EXTRA_BAN_DURATION,
  });
  if (created.error || !created.data.user) {
    return { error: created.error?.message ?? 'No se pudo crear la identidad técnica' };
  }

  const banned = await admin.updateUserById(identity.userId, {
    ban_duration: MANAGED_EXTRA_BAN_DURATION,
  });
  if (banned.error) return { error: banned.error.message };
  return { created: true };
}

async function ensureOpenContract(
  supabase: SupabaseClient,
  userId: string,
  overtimeRatePerHour: number,
): Promise<{ error: string | null }> {
  const { data: open, error: readErr } = await supabase
    .from('hours_contract_terms')
    .select('id')
    .eq('user_id', userId)
    .is('effective_to', null)
    .limit(1);
  if (readErr) return { error: readErr.message };
  if (open && open.length > 0) return { error: null };

  try {
    await persistContractualChange(
      supabase,
      userId,
      {
        weeklyHours: MANAGED_EXTRA_WEEKLY_HOURS,
        bagMode: false,
        regime: 'staff',
        overtimeRatePerHour,
      },
      MANAGED_EXTRA_JOINING_DATE,
    );
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'No se pudo abrir el tramo' };
  }
  return { error: null };
}

/**
 * Crea o repara Extra 1, Extra 2 y Extra 3.
 * Idempotente. No reinicia la tarifa si el slot ya tiene tramo abierto.
 * No devuelve contraseñas ni emails.
 */
export async function ensureManagedExtraSlots(
  supabase: SupabaseClient,
): Promise<EnsureManagedExtraSlotsResult> {
  const slots: EnsuredManagedExtraSlot[] = [];

  for (const identity of MANAGED_EXTRA_IDENTITIES) {
    const authResult = await ensureAuthUser(supabase.auth.admin, identity);
    if ('error' in authResult) return { ok: false, error: authResult.error };

    const { data: profile, error: profileReadErr } = await supabase
      .from('profiles')
      .select('id, staffing_mode, overtime_cost_per_hour')
      .eq('id', identity.userId)
      .maybeSingle();
    if (profileReadErr) return { ok: false, error: profileReadErr.message };

    const alreadyManaged = profile?.staffing_mode === MANAGED_EXTRA_ACCOUNT_KIND;
    const identityPatch = {
      staffing_mode: MANAGED_EXTRA_ACCOUNT_KIND,
      extra_slot: identity.slot,
      role: 'staff',
      first_name: managedExtraVisibleName(identity.slot),
      last_name: null,
      email: null,
      visible_in_plantilla: true,
      needs_onboarding: false,
    };

    if (!profile) {
      const { error: insertErr } = await supabase.from('profiles').insert({
        id: identity.userId,
        ...identityPatch,
        contracted_hours_weekly: MANAGED_EXTRA_WEEKLY_HOURS,
        overtime_cost_per_hour: MANAGED_EXTRA_INITIAL_RATE,
        monthly_cost: 0,
        prefer_stock_hours: false,
        is_fixed_salary: false,
        joining_date: MANAGED_EXTRA_JOINING_DATE,
      });
      if (insertErr) return { ok: false, error: insertErr.message };
    } else {
      const patch: Record<string, unknown> = { ...identityPatch };
      if (!alreadyManaged) {
        patch.contracted_hours_weekly = MANAGED_EXTRA_WEEKLY_HOURS;
        patch.overtime_cost_per_hour = MANAGED_EXTRA_INITIAL_RATE;
        patch.monthly_cost = 0;
        patch.prefer_stock_hours = false;
        patch.is_fixed_salary = false;
        patch.joining_date = MANAGED_EXTRA_JOINING_DATE;
      }
      const { error: updateErr } = await supabase
        .from('profiles')
        .update(patch)
        .eq('id', identity.userId);
      if (updateErr) return { ok: false, error: updateErr.message };
    }

    const storedRate = Number(profile?.overtime_cost_per_hour);
    const rate =
      alreadyManaged && Number.isFinite(storedRate) ? storedRate : MANAGED_EXTRA_INITIAL_RATE;
    const contract = await ensureOpenContract(supabase, identity.userId, rate);
    if (contract.error) return { ok: false, error: contract.error };

    slots.push({
      slot: identity.slot,
      userId: identity.userId,
      created: authResult.created,
    });
  }

  return { ok: true, slots };
}
