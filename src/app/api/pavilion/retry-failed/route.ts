import { createHash } from 'node:crypto';
import { after, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createClient as createSessionClient } from '@/utils/supabase/server';
import { isMasterDashboardUser } from '@/lib/master-dashboard';
import { PAVILION_ACTIVITIES_BUCKET } from '@/lib/pavilion-activities/ingest';
import { parsePdf } from '@/lib/pavilion/parser';
import { importOccupations } from '@/lib/pavilion/importer';

export const maxDuration = 300;

// Recuperación limitada a los cinco PDF fallidos del 3, 6, 7, 12 y 14
// de noviembre de 2026. Nunca rehacer días ya procesados.
const RECOVERY_DATES = [
  '2026-11-03',
  '2026-11-06',
  '2026-11-07',
  '2026-11-12',
  '2026-11-14',
] as const;

const MAX_ATTEMPTS = 3;

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('No se pudo inicializar Supabase.');
  return createAdminClient(url, key);
}

async function authorizedMaster(): Promise<boolean> {
  const supabase = await createSessionClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return false;

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('email')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) return false;
  return isMasterDashboardUser(profile?.email ?? user.email ?? '');
}

async function retryOne(
  supabase: ReturnType<typeof getAdminClient>,
  date: string,
): Promise<void> {
  const { data: sheet, error: loadError } = await supabase
    .from('pavilion_activity_sheets')
    .select('id, activity_date, original_filename, file_path, content_hash, processing_status, processing_attempts')
    .eq('activity_date', date)
    .maybeSingle();

  if (loadError || !sheet || sheet.processing_status !== 'error') {
    console.log('[pavilion/retry-failed] Omitido: no es un PDF fallido:', date, loadError?.message);
    return;
  }

  const attempts = Number(sheet.processing_attempts ?? 0);
  if (attempts >= MAX_ATTEMPTS) {
    console.warn('[pavilion/retry-failed] Límite de intentos alcanzado:', date);
    return;
  }

  // No modificar un día que ya tenga ocupaciones PDF, aunque su hoja
  // haya sido marcada erróneamente como fallida.
  const { data: existingOcc, error: occError } = await supabase
    .from('activity_occurrences')
    .select('id')
    .eq('activity_date', date)
    .eq('source_type', 'pdf')
    .limit(1)
    .maybeSingle();
  if (occError) throw new Error(`No se pudo comprobar ocupaciones ${date}: ${occError.message}`);
  if (existingOcc) {
    console.warn('[pavilion/retry-failed] Protegido: ya hay actividades PDF:', date);
    return;
  }

  // Compare-and-set: dos pulsaciones no pueden lanzar dos procesos del mismo PDF.
  const { data: claimed, error: claimError } = await supabase
    .from('pavilion_activity_sheets')
    .update({
      processing_status: 'processing',
      processing_error: null,
      processing_attempts: attempts + 1,
    })
    .eq('id', sheet.id)
    .eq('processing_status', 'error')
    .eq('processing_attempts', attempts)
    .select('id')
    .maybeSingle();

  if (claimError) throw new Error(`No se pudo reservar ${date}: ${claimError.message}`);
  if (!claimed) return;

  try {
    const { data: pdfBlob, error: fileError } = await supabase.storage
      .from(PAVILION_ACTIVITIES_BUCKET)
      .download(sheet.file_path);

    if (fileError || !pdfBlob) {
      throw new Error(`PDF no disponible: ${fileError?.message ?? date}`);
    }

    const bytes = Buffer.from(await pdfBlob.arrayBuffer());
    const hash = createHash('sha256').update(bytes).digest('hex');
    if (!sheet.content_hash || sheet.content_hash !== hash) {
      throw new Error('La copia guardada no coincide con el hash original; requiere revisión.');
    }

    const filename = sheet.original_filename || `${date}/activity.pdf`;
    const result = await parsePdf(bytes.toString('base64'), filename);
    if (!result.occupations.length) {
      throw new Error('Dos lecturas visuales sin ocupaciones válidas; requiere revisión del PDF.');
    }

    const normalized = result.occupations.map((occupation) => ({
      ...occupation,
      date,
    }));

    // Doble protección antes de escribir.
    const { data: current, error: currentError } = await supabase
      .from('pavilion_activity_sheets')
      .select('content_hash, processing_status')
      .eq('id', sheet.id)
      .single();

    if (currentError || !current ||
        current.content_hash !== hash ||
        current.processing_status !== 'processing') {
      throw new Error('El registro cambió durante la revisión; no se importa.');
    }

    await importOccupations(supabase, normalized, sheet.id);

    const notes = result.warnings.length
      ? `REVISAR extracción parcial: ${result.warnings.join(' | ').slice(0, 3500)}`
      : null;

    const { error: completeError } = await supabase
      .from('pavilion_activity_sheets')
      .update({
        processing_status: 'processed',
        processing_error: notes,
        processed_at: new Date().toISOString(),
      })
      .eq('id', sheet.id)
      .eq('content_hash', hash)
      .eq('processing_status', 'processing');
    if (completeError) throw new Error(`No se pudo registrar finalización: ${completeError.message}`);

    console.log('[pavilion/retry-failed] Recuperado:', date, normalized.length, 'ocupaciones;', result.warnings.length, 'avisos');
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error('[pavilion/retry-failed]', date, detail);
    const { error: updateError } = await supabase
      .from('pavilion_activity_sheets')
      .update({ processing_status: 'error', processing_error: detail.slice(0, 4000) })
      .eq('id', sheet.id)
      .eq('processing_status', 'processing')
      .eq('content_hash', sheet.content_hash);
    if (updateError) console.error('[pavilion/retry-failed] No se pudo registrar error:', updateError.message);
  }
}

export async function POST() {
  if (!(await authorizedMaster())) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from('pavilion_activity_sheets')
    .select('activity_date, processing_attempts')
    .in('activity_date', [...RECOVERY_DATES])
    .eq('processing_status', 'error');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const toRetry = (data ?? [])
    .filter((item) => Number(item.processing_attempts ?? 0) < MAX_ATTEMPTS)
    .map((item) => String(item.activity_date));

  if (!toRetry.length) {
    return NextResponse.json({ success: true, queued: 0, dates: [] });
  }

  after(async () => {
    for (const date of toRetry) {
      try {
        await retryOne(supabase, date);
      } catch (error) {
        console.error('[pavilion/retry-failed] Fallo antes de procesar:', date, error);
      }
    }
  });

  return NextResponse.json({
    success: true,
    queued: toRetry.length,
    dates: toRetry,
    message: 'Reprocesamiento iniciado. Los documentos correctos no se modificarán.',
  });
}
