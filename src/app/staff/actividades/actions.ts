'use server';

import { createClient } from '@/utils/supabase/server';
import { isMasterDashboardUser } from '@/lib/master-dashboard';
import {
  createPavilionActivitiesServiceClient,
  syncPavilionActivitiesFromGmail,
} from '@/lib/gmail/pavilion-activities-sync';

const BUCKET = 'pavilion_activities';
const MAX_BYTES = 10 * 1024 * 1024;

export type PavilionActivityRow = {
  activityDate: string;
  filePath: string;
  source: 'email' | 'manual';
  originalFilename: string | null;
};

async function requireAuthenticated() {
  const supabase = await createClient();
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session?.user) {
    return { ok: false as const, error: 'No autorizado' };
  }

  return { ok: true as const, supabase, userId: session.user.id, email: session.user.email ?? '' };
}

async function requireMasterUpload() {
  const auth = await requireAuthenticated();
  if (!auth.ok) return auth;

  const { data: profile } = await auth.supabase
    .from('profiles')
    .select('email')
    .eq('id', auth.userId)
    .maybeSingle();

  const email = profile?.email ?? auth.email;
  if (!isMasterDashboardUser(email)) {
    return { ok: false as const, error: 'Solo Hector puede subir actividades manualmente.' };
  }

  return auth;
}

function buildStoragePath(activityDate: string): string {
  return `${activityDate}/activity.pdf`;
}

export async function fetchPavilionActivitiesForRangeAction(params: {
  startDate: string;
  endDate: string;
}): Promise<
  | { success: true; rows: PavilionActivityRow[] }
  | { success: false; error: string }
> {
  const auth = await requireAuthenticated();
  if (!auth.ok) return { success: false, error: auth.error };

  const { startDate, endDate } = params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return { success: false, error: 'Rango de fechas no válido.' };
  }

  const { data, error } = await auth.supabase
    .from('pavilion_activity_sheets')
    .select('activity_date, file_path, source, original_filename')
    .gte('activity_date', startDate)
    .lte('activity_date', endDate)
    .order('activity_date', { ascending: true });

  if (error) {
    return { success: false, error: error.message ?? 'Error al cargar actividades.' };
  }

  const rows: PavilionActivityRow[] = (data ?? []).map((r) => ({
    activityDate: r.activity_date as string,
    filePath: r.file_path as string,
    source: r.source as 'email' | 'manual',
    originalFilename: (r.original_filename as string | null) ?? null,
  }));

  return { success: true, rows };
}

export async function getPavilionActivitySignedUrlAction(params: {
  filePath: string;
}): Promise<{ success: true; url: string } | { success: false; error: string }> {
  const auth = await requireAuthenticated();
  if (!auth.ok) return { success: false, error: auth.error };

  const filePath = params.filePath?.trim();
  if (!filePath || filePath.includes('..')) {
    return { success: false, error: 'Ruta de archivo no válida.' };
  }

  const { data, error } = await auth.supabase.storage
    .from(BUCKET)
    .createSignedUrl(filePath, 3600);

  if (error || !data?.signedUrl) {
    return { success: false, error: error?.message ?? 'No se pudo obtener el PDF.' };
  }

  return { success: true, url: data.signedUrl };
}

export async function uploadPavilionActivityAction(params: {
  activityDate: string;
  fileBase64: string;
  filename?: string;
}): Promise<{ success: true; filePath: string } | { success: false; error: string }> {
  const auth = await requireMasterUpload();
  if (!auth.ok) return { success: false, error: auth.error };

  const { activityDate, fileBase64, filename } = params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(activityDate)) {
    return { success: false, error: 'Fecha no válida.' };
  }

  if (!fileBase64?.trim()) {
    return { success: false, error: 'No se recibió ningún archivo.' };
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(fileBase64, 'base64');
  } catch {
    return { success: false, error: 'Archivo corrupto.' };
  }

  if (buffer.length === 0) {
    return { success: false, error: 'El archivo está vacío.' };
  }
  if (buffer.length > MAX_BYTES) {
    return { success: false, error: 'El PDF supera el límite de 10 MB.' };
  }

  const header = buffer.subarray(0, 5).toString('ascii');
  if (!header.startsWith('%PDF-')) {
    return { success: false, error: 'El archivo debe ser un PDF.' };
  }

  const storagePath = buildStoragePath(activityDate);

  const { error: uploadError } = await auth.supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, {
      contentType: 'application/pdf',
      upsert: true,
    });

  if (uploadError) {
    return { success: false, error: uploadError.message ?? 'Error al subir el PDF.' };
  }

  const { error: upsertError } = await auth.supabase.from('pavilion_activity_sheets').upsert(
    {
      activity_date: activityDate,
      file_path: storagePath,
      source: 'manual',
      gmail_message_id: null,
      original_filename: filename?.trim() || 'manual.pdf',
      uploaded_by: auth.userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'activity_date' },
  );

  if (upsertError) {
    return { success: false, error: upsertError.message ?? 'Error al guardar en base de datos.' };
  }

  return { success: true, filePath: storagePath };
}

export async function syncPavilionActivitiesNowAction(): Promise<
  | { success: true; processed: number; imported: number; skipped: number; errors: string[] }
  | { success: false; error: string }
> {
  const auth = await requireMasterUpload();
  if (!auth.ok) return { success: false, error: auth.error };

  try {
    const service = createPavilionActivitiesServiceClient();
    const result = await syncPavilionActivitiesFromGmail(service);
    return { success: true, ...result };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error al sincronizar Gmail.';
    return { success: false, error: message };
  }
}
