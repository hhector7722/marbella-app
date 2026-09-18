'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/utils/supabase/server';
import { isMasterDashboardUser } from '@/lib/master-dashboard';
import { isSandboxRequest } from '@/lib/sandbox/server';
import { persistContractualChange, writeProjectionFromWeek } from '@/lib/hours-engine';
import { parseCivilYmd } from '@/lib/hours-engine/labor-conditions.ts';
import { candidateFieldsSchema } from '@/lib/alta-laboral/schema.ts';
import { candidateToRow, existingProfileHasSensitiveData, intakeToProfilePatch } from '@/lib/alta-laboral/mapping.ts';
import { canGenerateAltaPdf, missingAltaPdfFields } from '@/lib/alta-laboral/completeness.ts';
import { createAltaServiceClient } from '@/lib/alta-laboral/service-client.ts';
import { generateIntakeToken, hashIntakeToken, intakeExpiresAt } from '@/lib/alta-laboral/token.ts';
import { generateTemporaryPassword } from '@/lib/alta-laboral/password.ts';
import { ALTA_BUCKET, imageExtension, profileDniPath } from '@/lib/alta-laboral/storage.ts';
import { displayStatus } from '@/lib/alta-laboral/dates.ts';
import type { CandidateFields, ContractFields, EmploymentIntakeRow } from '@/lib/alta-laboral/types.ts';
import { INTAKE_STATUS_LABEL } from '@/lib/alta-laboral/types.ts';

async function requireMaster() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email || !isMasterDashboardUser(user.email)) {
    return { ok: false as const, error: 'Acceso denegado', user: null, admin: null };
  }
  return { ok: true as const, error: null, user, admin: createAltaServiceClient() };
}

function revalidateAltas(id?: string) {
  revalidatePath('/dashboard/altas');
  if (id) revalidatePath(`/dashboard/altas/${id}`);
  revalidatePath('/profile');
}

export async function createEmploymentIntake(): Promise<
  { success: true; id: string; token: string; path: string } | { success: false; error: string }
> {
  if (await isSandboxRequest()) {
    return { success: false, error: 'No se puede crear un alta desde el sandbox' };
  }
  const gate = await requireMaster();
  if (!gate.ok || !gate.admin || !gate.user) return { success: false, error: gate.error ?? 'Acceso denegado' };

  const token = generateIntakeToken();
  const { data, error } = await gate.admin
    .from('employment_intakes')
    .insert({
      token_hash: hashIntakeToken(token),
      status: 'pending_candidate',
      expires_at: intakeExpiresAt().toISOString(),
      created_by: gate.user.id,
    })
    .select('id')
    .single();

  if (error || !data) {
    return { success: false, error: error?.message ?? 'No se pudo crear el enlace' };
  }

  revalidateAltas();
  return { success: true, id: data.id, token, path: `/alta/${token}` };
}

export type IntakeListItem = {
  id: string;
  status: EmploymentIntakeRow['status'];
  statusLabel: string;
  name: string;
  email: string;
  createdAt: string;
  expiresAt: string;
};

export async function listEmploymentIntakes(): Promise<
  { success: true; items: IntakeListItem[] } | { success: false; error: string }
> {
  const gate = await requireMaster();
  if (!gate.ok || !gate.admin) return { success: false, error: gate.error ?? 'Acceso denegado' };

  const { data, error } = await gate.admin
    .from('employment_intakes')
    .select(
      'id, status, expires_at, created_at, first_name, last_name, email',
    )
    .order('created_at', { ascending: false });

  if (error) return { success: false, error: error.message };

  const items: IntakeListItem[] = (data ?? []).map((row) => {
    const status = displayStatus(row as EmploymentIntakeRow);
    const name = `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim();
    return {
      id: row.id,
      status,
      statusLabel: INTAKE_STATUS_LABEL[status],
      name: name || 'Sin nombre todavía',
      email: row.email ?? '',
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    };
  });

  return { success: true, items };
}

export async function getEmploymentIntake(id: string): Promise<
  { success: true; intake: EmploymentIntakeRow } | { success: false; error: string }
> {
  const gate = await requireMaster();
  if (!gate.ok || !gate.admin) return { success: false, error: gate.error ?? 'Acceso denegado' };

  const { data, error } = await gate.admin
    .from('employment_intakes')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) return { success: false, error: error.message };
  if (!data) return { success: false, error: 'Alta no encontrada' };
  return { success: true, intake: data as EmploymentIntakeRow };
}

export async function saveEmploymentIntake(
  id: string,
  input: { candidate?: CandidateFields; contract?: ContractFields },
): Promise<{ success: true } | { success: false; error: string }> {
  if (await isSandboxRequest()) return { success: true };
  const gate = await requireMaster();
  if (!gate.ok || !gate.admin) return { success: false, error: gate.error ?? 'Acceso denegado' };

  const patch: Record<string, unknown> = {};

  if (input.candidate) {
    const hasAny = Object.values(input.candidate).some((v) => String(v ?? '').trim() !== '');
    if (hasAny) {
      const parsed = candidateFieldsSchema.safeParse(input.candidate);
      if (!parsed.success) {
        return { success: false, error: parsed.error.issues[0]?.message ?? 'Datos del trabajador no válidos' };
      }
      Object.assign(patch, candidateToRow(parsed.data));
    }
  }

  if (input.contract) {
    const c = input.contract;
    if (c.fechaInicio && !parseCivilYmd(c.fechaInicio)) {
      return { success: false, error: 'Fecha de inicio no válida' };
    }
    if (c.fechaFin && !parseCivilYmd(c.fechaFin)) {
      return { success: false, error: 'Fecha de finalización no válida' };
    }
    if (c.fechaFin && c.fechaInicio && c.fechaFin < c.fechaInicio) {
      return { success: false, error: 'La fecha de fin no puede ser anterior al inicio' };
    }
    if (c.weeklyHours != null && (!Number.isFinite(c.weeklyHours) || c.weeklyHours < 0)) {
      return { success: false, error: 'Las horas semanales no pueden ser negativas' };
    }
    Object.assign(patch, {
      categoria: c.categoria.trim() || null,
      tipo_contrato: c.tipoContrato.trim() || null,
      weekly_hours: c.weeklyHours,
      fecha_inicio: c.fechaInicio.trim() || null,
      fecha_fin: c.fechaFin?.trim() || null,
    });
  }

  const { data: current, error: loadErr } = await gate.admin
    .from('employment_intakes')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (loadErr || !current) return { success: false, error: loadErr?.message ?? 'Alta no encontrada' };

  const merged = { ...(current as EmploymentIntakeRow), ...patch } as EmploymentIntakeRow;
  if (current.status === 'submitted' && canGenerateAltaPdf(merged)) {
    patch.status = 'completed';
    patch.completed_at = new Date().toISOString();
  } else if (current.status === 'pending_candidate' && canGenerateAltaPdf(merged)) {
    patch.status = 'completed';
    patch.completed_at = new Date().toISOString();
  }

  const { error } = await gate.admin.from('employment_intakes').update(patch).eq('id', id);
  if (error) return { success: false, error: error.message };
  revalidateAltas(id);
  return { success: true };
}

export async function revokeEmploymentIntake(
  id: string,
): Promise<{ success: true } | { success: false; error: string }> {
  if (await isSandboxRequest()) return { success: true };
  const gate = await requireMaster();
  if (!gate.ok || !gate.admin) return { success: false, error: gate.error ?? 'Acceso denegado' };

  const { error } = await gate.admin
    .from('employment_intakes')
    .update({ status: 'revoked', revoked_at: new Date().toISOString() })
    .eq('id', id)
    .in('status', ['pending_candidate', 'submitted']);
  if (error) return { success: false, error: error.message };
  revalidateAltas(id);
  return { success: true };
}

async function copyDniToProfile(
  admin: ReturnType<typeof createAltaServiceClient>,
  intake: EmploymentIntakeRow,
  userId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const copies: Array<{ from: string; side: 'delantera' | 'trasera' }> = [];
  if (intake.dni_front_storage_path) copies.push({ from: intake.dni_front_storage_path, side: 'delantera' });
  if (intake.dni_back_storage_path) copies.push({ from: intake.dni_back_storage_path, side: 'trasera' });

  for (const copy of copies) {
    const ext = imageExtension(copy.from) ?? 'jpg';
    const dest = profileDniPath(userId, copy.side, ext);
    const { error } = await admin.storage.from(ALTA_BUCKET).copy(copy.from, dest);
    if (error && !/already exists|Duplicate/i.test(error.message)) {
      const downloaded = await admin.storage.from(ALTA_BUCKET).download(copy.from);
      if (downloaded.error || !downloaded.data) {
        return { success: false, error: downloaded.error?.message ?? 'No se pudo copiar el documento' };
      }
      const uploaded = await admin.storage.from(ALTA_BUCKET).upload(dest, downloaded.data, {
        upsert: true,
        contentType: downloaded.data.type || 'image/jpeg',
      });
      if (uploaded.error) return { success: false, error: uploaded.error.message };
    }
  }

  return { success: true };
}

async function applyContractTerms(
  admin: ReturnType<typeof createAltaServiceClient>,
  userId: string,
  intake: EmploymentIntakeRow,
  kind: 'create' | 'link',
): Promise<{ success: true } | { success: false; error: string }> {
  const weeklyHours = Number(intake.weekly_hours ?? 0);
  const from = intake.fecha_inicio;
  if (!from) return { success: true };

  if (kind === 'create') {
    const { error: wipeErr } = await admin.from('hours_contract_terms').delete().eq('user_id', userId);
    if (wipeErr) return { success: false, error: wipeErr.message };
  }

  try {
    await persistContractualChange(
      admin,
      userId,
      {
        weeklyHours,
        bagMode: false,
        regime: 'staff',
        overtimeRatePerHour: null,
      },
      from,
    );
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'No se pudo guardar el contrato' };
  }

  if (intake.fecha_fin) {
    const { error } = await admin
      .from('hours_contract_terms')
      .update({ effective_to: intake.fecha_fin })
      .eq('user_id', userId)
      .is('effective_to', null);
    if (error) return { success: false, error: error.message };
  }

  if (kind === 'link') {
    const written = await writeProjectionFromWeek(admin, userId, from, 'recalc');
    if (!written.ok) {
      console.error('alta laboral proyección', written.error);
    }
  }

  return { success: true };
}

export async function applyIntakeCreateUser(
  id: string,
): Promise<
  | { success: true; userId: string; password: string }
  | { success: false; error: string; needsLink?: boolean; existingProfileId?: string; existingName?: string }
> {
  if (await isSandboxRequest()) {
    return { success: false, error: 'No se puede crear un usuario desde el sandbox' };
  }
  const gate = await requireMaster();
  if (!gate.ok || !gate.admin) return { success: false, error: gate.error ?? 'Acceso denegado' };

  const loaded = await getEmploymentIntake(id);
  if (!loaded.success) return loaded;
  const intake = loaded.intake;
  if (intake.status === 'applied') return { success: false, error: 'Esta alta ya está aplicada' };
  if (!canGenerateAltaPdf(intake)) {
    const missing = missingAltaPdfFields(intake).map((f) => f.label).join(', ');
    return { success: false, error: `Faltan datos: ${missing}` };
  }

  const email = (intake.email ?? '').trim().toLowerCase();
  const { data: existing } = await gate.admin
    .from('profiles')
    .select('id, first_name, last_name')
    .ilike('email', email)
    .maybeSingle();
  if (existing) {
    return {
      success: false,
      error: 'Ya existe un usuario con este correo',
      needsLink: true,
      existingProfileId: existing.id,
      existingName: `${existing.first_name ?? ''} ${existing.last_name ?? ''}`.trim(),
    };
  }

  const password = generateTemporaryPassword();
  const created = await gate.admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      first_name: intake.first_name,
      last_name: intake.last_name,
    },
  });
  if (created.error || !created.data.user) {
    const msg = created.error?.message ?? 'No se pudo crear la cuenta';
    if (/already|registered|exists/i.test(msg)) {
      return { success: false, error: 'Ya existe una cuenta con este correo', needsLink: true };
    }
    return { success: false, error: msg };
  }

  const userId = created.data.user.id;
  const patch = intakeToProfilePatch(intake);
  const { error: profileErr } = await gate.admin.from('profiles').upsert({
    id: userId,
    ...patch,
  });
  if (profileErr) return { success: false, error: profileErr.message };

  const copied = await copyDniToProfile(gate.admin, intake, userId);
  if (!copied.success) return copied;

  const terms = await applyContractTerms(gate.admin, userId, intake, 'create');
  if (!terms.success) return terms;

  const { error: applyErr } = await gate.admin
    .from('employment_intakes')
    .update({
      status: 'applied',
      applied_at: new Date().toISOString(),
      profile_id: userId,
    })
    .eq('id', id);
  if (applyErr) return { success: false, error: applyErr.message };

  revalidateAltas(id);
  return { success: true, userId, password };
}

export async function applyIntakeLinkProfile(
  id: string,
  profileId: string,
  confirmOverwrite = false,
): Promise<{ success: true } | { success: false; error: string; needsConfirm?: boolean }> {
  if (await isSandboxRequest()) {
    return { success: false, error: 'No se puede aplicar un alta desde el sandbox' };
  }
  const gate = await requireMaster();
  if (!gate.ok || !gate.admin) return { success: false, error: gate.error ?? 'Acceso denegado' };

  const loaded = await getEmploymentIntake(id);
  if (!loaded.success) return loaded;
  const intake = loaded.intake;
  if (intake.status === 'applied') return { success: false, error: 'Esta alta ya está aplicada' };
  if (!canGenerateAltaPdf(intake)) {
    const missing = missingAltaPdfFields(intake).map((f) => f.label).join(', ');
    return { success: false, error: `Faltan datos: ${missing}` };
  }

  const { data: profile, error: profileLoadErr } = await gate.admin
    .from('profiles')
    .select('id, dni, bank_account, first_name, last_name')
    .eq('id', profileId)
    .maybeSingle();
  if (profileLoadErr || !profile) {
    return { success: false, error: profileLoadErr?.message ?? 'Perfil no encontrado' };
  }

  if (!confirmOverwrite && existingProfileHasSensitiveData(profile)) {
    return {
      success: false,
      error: 'Este perfil ya tiene documento o IBAN. Confirma si quieres sustituirlos.',
      needsConfirm: true,
    };
  }

  const patch = intakeToProfilePatch(intake);
  const { error: updateErr } = await gate.admin.from('profiles').update(patch).eq('id', profileId);
  if (updateErr) return { success: false, error: updateErr.message };

  const copied = await copyDniToProfile(gate.admin, intake, profileId);
  if (!copied.success) return copied;

  const terms = await applyContractTerms(gate.admin, profileId, intake, 'link');
  if (!terms.success) return terms;

  const { error: applyErr } = await gate.admin
    .from('employment_intakes')
    .update({
      status: 'applied',
      applied_at: new Date().toISOString(),
      profile_id: profileId,
    })
    .eq('id', id);
  if (applyErr) return { success: false, error: applyErr.message };

  revalidateAltas(id);
  return { success: true };
}

export async function listProfilesForIntakeLink(): Promise<
  | {
      success: true;
      profiles: Array<{ id: string; first_name: string; last_name: string; email: string | null; avatar_url: string | null }>;
    }
  | { success: false; error: string }
> {
  const gate = await requireMaster();
  if (!gate.ok || !gate.admin) return { success: false, error: gate.error ?? 'Acceso denegado' };

  const { data, error } = await gate.admin
    .from('profiles')
    .select('id, first_name, last_name, email, avatar_url')
    .order('first_name', { ascending: true });
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    profiles: (data ?? []).map((p) => ({
      id: p.id,
      first_name: p.first_name ?? '',
      last_name: p.last_name ?? '',
      email: p.email,
      avatar_url: p.avatar_url,
    })),
  };
}
