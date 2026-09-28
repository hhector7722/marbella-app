'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/utils/supabase/server';
import {
  loadEmployeeBoundaryFacts,
  writeProjectionFromWeek,
} from '@/lib/hours-engine';
import {
  assertSavableExpectedWeek,
  ExpectedHoursError,
  expectedHoursUpsertPayload,
  interpretExpectedHoursRows,
  summarizeClosureHours,
} from '@/lib/hours-engine/expected-hours';
import {
  assertExpectedHoursMatchContract,
  expectedHoursContractReference,
} from '@/lib/hours-engine/expected-hours-contract-validation';
import type { CivilDate } from '@/lib/hours-engine/types';
import { mondayOnOrBefore, weekBounds } from '@/lib/hours-engine/week-dates';
import { isSandboxRequest } from '@/lib/sandbox/server';
import { canManageStaffAttendance } from '@/lib/staff/attendance-access';

type AuthOk = { ok: true; editorId: string };
type AuthFail = { ok: false; error: string };

async function requireAttendanceEditor(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<AuthOk | AuthFail> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'No autenticado' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, email')
    .eq('id', user.id)
    .single();

  if (!canManageStaffAttendance(profile?.role, user.email ?? profile?.email)) {
    return { ok: false, error: 'Sin permiso para gestionar asistencia' };
  }

  return { ok: true, editorId: user.id };
}

function failureMessage(error: unknown): string {
  if (error instanceof ExpectedHoursError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}

export async function loadWeeklyExpectedHours(userId: string, weekStart: string) {
  if (await isSandboxRequest()) {
    return {
      success: true as const,
      status: 'unconfigured' as const,
      hours: null,
      referenceHours: 0,
    };
  }

  const supabase = await createClient();
  const auth = await requireAttendanceEditor(supabase);
  if (!auth.ok) return { success: false as const, error: auth.error };

  let monday: CivilDate;
  try {
    monday = mondayOnOrBefore(weekStart.split('T')[0]! as CivilDate);
  } catch (error) {
    return { success: false as const, error: failureMessage(error) };
  }

  let referenceHours: number;
  try {
    const employee = await loadEmployeeBoundaryFacts(supabase, userId);
    referenceHours = expectedHoursContractReference(employee, monday);
  } catch (error) {
    return { success: false as const, error: failureMessage(error) };
  }

  const { data, error } = await supabase
    .from('weekly_expected_hours')
    .select('week_start, day, expected_hours')
    .eq('user_id', userId)
    .eq('week_start', monday);

  if (error) return { success: false as const, error: error.message };

  try {
    const interpreted = interpretExpectedHoursRows(monday, data ?? []);
    if (interpreted.status === 'unconfigured') {
      return {
        success: true as const,
        status: 'unconfigured' as const,
        hours: null,
        referenceHours,
      };
    }
    const { days } = weekBounds(monday);
    return {
      success: true as const,
      status: 'configured' as const,
      hours: days.map((day) => interpreted.byDay[day]!),
      referenceHours,
    };
  } catch (caught) {
    return {
      success: true as const,
      status: 'invalid' as const,
      error: failureMessage(caught),
      hours: null,
      referenceHours,
    };
  }
}

export async function saveWeeklyExpectedHours(
  userId: string,
  weekStart: string,
  entries: readonly { day: string; expectedHours: number }[],
) {
  if (await isSandboxRequest()) {
    return { success: true as const, simulated: true as const };
  }

  const supabase = await createClient();
  const auth = await requireAttendanceEditor(supabase);
  if (!auth.ok) return { success: false as const, error: auth.error };

  let monday: CivilDate;
  let byDay;
  try {
    monday = mondayOnOrBefore(weekStart.split('T')[0]! as CivilDate);
    byDay = assertSavableExpectedWeek(monday, entries);
  } catch (error) {
    return { success: false as const, error: failureMessage(error) };
  }

  // El total debe cuadrar con la jornada contractual real (hours_contract_terms),
  // no con lo que mande el cliente. Misma referencia que el Hours Engine.
  try {
    const employee = await loadEmployeeBoundaryFacts(supabase, userId);
    assertExpectedHoursMatchContract(employee, monday, byDay);
  } catch (error) {
    return { success: false as const, error: failureMessage(error) };
  }

  const { days } = weekBounds(monday);
  const rows = expectedHoursUpsertPayload(userId, monday, byDay, auth.editorId);

  const { error } = await supabase.from('weekly_expected_hours').upsert(rows, {
    onConflict: 'user_id,week_start,day',
  });
  if (error) return { success: false as const, error: error.message };

  const written = await writeProjectionFromWeek(supabase, userId, monday);
  if (!written.ok) return { success: false as const, error: written.error };

  revalidatePath('/staff/history');
  revalidatePath('/dashboard/overtime');
  revalidatePath('/dashboard');

  const summary = summarizeClosureHours(days, byDay);
  return { success: true as const, summary };
}
