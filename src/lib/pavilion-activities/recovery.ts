import { createHash } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { PAVILION_ACTIVITIES_BUCKET } from '@/lib/pavilion-activities/ingest';
import { parsePdf } from '@/lib/pavilion/parser';
import { importOccupations } from '@/lib/pavilion/importer';

const FIRST_AUTOMATIC_DATE = '2026-10-26';
const MAX_ATTEMPTS = 3;
const STALE_AFTER_MS = 20 * 60 * 1000;
const MAX_BATCH_SIZE = 3;

type ProcessingStatus = 'pending' | 'processing' | 'error';

type ActivitySheet = {
  id: string;
  activity_date: string;
  original_filename: string | null;
  file_path: string;
  content_hash: string | null;
  processing_status: ProcessingStatus;
  processing_attempts: number;
  updated_at: string;
};

type RecoveryOutcome = {
  date: string;
  outcome: 'recovered' | 'failed' | 'skipped';
  reason?: string;
};

export function getPavilionAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase no está configurado para recuperar actividades.');
  return createClient(url, key);
}

function isEligible(sheet: ActivitySheet, now: number, forceErrors: boolean): boolean {
  if (!sheet.content_hash || Number(sheet.processing_attempts) >= MAX_ATTEMPTS) return false;
  if (sheet.processing_status === 'error' && forceErrors) return true;

  const updatedAt = Date.parse(sheet.updated_at);
  return Number.isFinite(updatedAt) && updatedAt <= now - STALE_AFTER_MS;
}

async function recoverOne(supabase: SupabaseClient, sheet: ActivitySheet): Promise<RecoveryOutcome> {
  const date = sheet.activity_date;
  const attempts = Number(sheet.processing_attempts ?? 0);
  const contentHash = sheet.content_hash;
  if (!contentHash) return { date, outcome: 'skipped', reason: 'Hash ausente' };

  // Nunca rehacer un día que ya tenga actividades importadas (aunque
  // la hoja aparezca pendiente o con error por un fallo posterior).
  const { data: existing, error: existingError } = await supabase
    .from('activity_occurrences')
    .select('id')
    .eq('activity_date', date)
    .eq('source_type', 'pdf')
    .limit(1)
    .maybeSingle();

  if (existingError) throw new Error(`No se pudo proteger ${date}: ${existingError.message}`);
  if (existing) return { date, outcome: 'skipped', reason: 'Ocupaciones existentes: revisión manual' };

  // Compare-and-set: si otra ejecución ya lo reservó, no duplicar el OCR.
  const { data: claimed, error: claimError } = await supabase
    .from('pavilion_activity_sheets')
    .update({
      processing_status: 'processing',
      processing_error: null,
      processing_attempts: attempts + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sheet.id)
    .eq('processing_status', sheet.processing_status)
    .eq('processing_attempts', attempts)
    .eq('content_hash', contentHash)
    .select('id')
    .maybeSingle();

  if (claimError) throw new Error(`No se pudo reservar ${date}: ${claimError.message}`);
  if (!claimed) return { date, outcome: 'skipped', reason: 'Reservado por otra ejecución' };

  try {
    const { data: file, error: downloadError } = await supabase.storage
      .from(PAVILION_ACTIVITIES_BUCKET)
      .download(sheet.file_path);

    if (downloadError || !file) {
      throw new Error(`PDF no disponible: ${downloadError?.message ?? date}`);
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const actualHash = createHash('sha256').update(bytes).digest('hex');
    if (actualHash !== contentHash) {
      throw new Error('Hash de Storage distinto del documento original; requiere revisión.');
    }

    const filename = sheet.original_filename || `${date}/activity.pdf`;
    const parsed = await parsePdf(bytes.toString('base64'), filename);
    if (!parsed.occupations.length) {
      throw new Error('Mistral no extrajo ninguna ocupación en dos lecturas.');
    }

    // Comprobar que la hoja sigue siendo la misma y que no han aparecido
    // ocupaciones desde la reserva inicial.
    const { data: current, error: currentError } = await supabase
      .from('pavilion_activity_sheets')
      .select('content_hash, processing_status')
      .eq('id', sheet.id)
      .single();

    if (currentError || !current ||
        current.content_hash !== contentHash || current.processing_status !== 'processing') {
      throw new Error('La hoja cambió durante el procesamiento; no se importa.');
    }

    const { data: concurrent, error: concurrentError } = await supabase
      .from('activity_occurrences')
      .select('id')
      .eq('activity_date', date)
      .eq('source_type', 'pdf')
      .limit(1)
      .maybeSingle();

    if (concurrentError) throw new Error(`No se pudo verificar ocupaciones: ${concurrentError.message}`);
    if (concurrent) throw new Error('Ya existen ocupaciones para el día; requiere revisión manual.');

    const imported = await importOccupations(
      supabase,
      parsed.occupations.map((occupation) => ({ ...occupation, date })),
      sheet.id,
    );

    if (imported.occurrencesInserted === 0) {
      throw new Error('Extracción sin ocupaciones P1-P4 importadas; requiere revisión.');
    }

    // No confundir OCR completado con filas realmente persistidas.
    const { count, error: verifyError } = await supabase
      .from('activity_occurrences')
      .select('id', { count: 'exact', head: true })
      .eq('source_pdf_id', sheet.id)
      .eq('source_type', 'pdf')
      .eq('activity_date', date);

    if (verifyError || count !== imported.occurrencesInserted) {
      throw new Error(`Verificación de importación fallida: ${verifyError?.message ?? `${count}/${imported.occurrencesInserted}`}`);
    }

    const warnings = parsed.warnings.length
      ? `REVISAR extracción parcial: ${parsed.warnings.join(' | ').slice(0, 3500)}`
      : null;

    const { data: completed, error: completeError } = await supabase
      .from('pavilion_activity_sheets')
      .update({
        processing_status: 'processed',
        processing_error: warnings,
        processed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', sheet.id)
      .eq('processing_status', 'processing')
      .eq('content_hash', contentHash)
      .select('id')
      .maybeSingle();

    if (completeError || !completed) {
      throw new Error(`No se pudo confirmar importación: ${completeError?.message ?? 'estado modificado'}`);
    }

    console.log('[pavilion/recovery] Recuperado', date, imported.occurrencesInserted, 'ocupaciones, avisos:', parsed.warnings.length);
    return { date, outcome: 'recovered', reason: warnings || undefined };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error('[pavilion/recovery] Falló', date, reason);
    const { error: statusError } = await supabase
      .from('pavilion_activity_sheets')
      .update({
        processing_status: 'error',
        processing_error: reason.slice(0, 4000),
        updated_at: new Date().toISOString(),
      })
      .eq('id', sheet.id)
      .eq('content_hash', contentHash)
      .eq('processing_status', 'processing');
    if (statusError) console.error('[pavilion/recovery] No se pudo registrar fallo:', date, statusError.message);
    return { date, outcome: 'failed', reason };
  }
}

export async function recoverPavilionActivityBatch(
  supabase: SupabaseClient,
  options: { forceErrors?: boolean } = {},
): Promise<{ selected: number; recovered: number; failed: number; skipped: number; dates: string[] }> {
  const { data, error } = await supabase
    .from('pavilion_activity_sheets')
    .select('id, activity_date, original_filename, file_path, content_hash, processing_status, processing_attempts, updated_at')
    .eq('source', 'email')
    .gte('activity_date', FIRST_AUTOMATIC_DATE)
    .in('processing_status', ['error', 'pending', 'processing'])
    .lt('processing_attempts', MAX_ATTEMPTS)
    .order('activity_date', { ascending: true })
    .limit(200);

  if (error) throw new Error(`No se pudieron consultar los PDF pendientes: ${error.message}`);

  const now = Date.now();
  const candidates = ((data ?? []) as ActivitySheet[])
    .filter((sheet) => isEligible(sheet, now, options.forceErrors ?? false));

  const outcomes: RecoveryOutcome[] = [];
  for (const sheet of candidates) {
    if (outcomes.filter((item) => item.outcome !== 'skipped').length >= MAX_BATCH_SIZE) break;
    try {
      outcomes.push(await recoverOne(supabase, sheet));
    } catch (error) {
      console.error('[pavilion/recovery] Error previo a la recuperación:', sheet.activity_date, error);
      outcomes.push({
        date: sheet.activity_date,
        outcome: 'failed',
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    selected: outcomes.length,
    recovered: outcomes.filter((item) => item.outcome === 'recovered').length,
    failed: outcomes.filter((item) => item.outcome === 'failed').length,
    skipped: outcomes.filter((item) => item.outcome === 'skipped').length,
    dates: outcomes.map((item) => item.date),
  };
}
