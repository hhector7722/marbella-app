'use server';

import { createAltaServiceClient } from '@/lib/alta-laboral/service-client.ts';
import { isMasterDashboardUser } from '@/lib/master-dashboard';
import { isSandboxRequest } from '@/lib/sandbox/server';
import {
  ensureManagedExtraSlots,
  type EnsureManagedExtraSlotsResult,
} from '@/lib/staff/ensure-managed-extra-slots.ts';
import { createClient } from '@/utils/supabase/server';

/** Bootstrap administrativo. No se llama en cada request. Solo master. */
export async function ensureManagedExtraSlotsAction(): Promise<EnsureManagedExtraSlotsResult> {
  if (await isSandboxRequest()) {
    return { ok: false, error: 'No disponible en el sandbox' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email || !isMasterDashboardUser(user.email)) {
    return { ok: false, error: 'Acceso denegado' };
  }

  return ensureManagedExtraSlots(createAltaServiceClient());
}
