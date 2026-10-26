import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveActivityDate, parseActivityDateFromText, madridIsoDateFromEpochMs } from '@/lib/pavilion-activities/date-parse';

export const PAVILION_ACTIVITIES_BUCKET = 'pavilion_activities';
export const PAVILION_ACTIVITY_MAX_BYTES = 10 * 1024 * 1024;

export type IngestPavilionActivityParams = {
  pdfBuffer: Buffer;
  filename: string;
  subject?: string | null;
  emailDate?: string | null;
  activityDate?: string | null;
  gmailMessageId?: string | null;
  source: 'email' | 'manual';
  uploadedBy?: string | null;
};

export type IngestPavilionActivityResult = {
  sheetId: string;
  activityDate: string;
  filePath: string;
  contentHash: string;
  skipped?: boolean;
  skipReason?: 'ignored_historical' | 'deduplicated' | 'existing_occupations';
};

function buildStoragePath(activityDate: string): string {
  return `${activityDate}/activity.pdf`;
}

function hashPdf(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function assertPdfBuffer(buffer: Buffer): void {
  if (buffer.length === 0) throw new Error('El archivo está vacío.');
  if (buffer.length > PAVILION_ACTIVITY_MAX_BYTES) {
    throw new Error('El PDF supera el límite de 10 MB.');
  }
  const header = buffer.subarray(0, 5).toString('ascii');
  if (!header.startsWith('%PDF-')) {
    throw new Error('El archivo debe ser un PDF.');
  }
}

export function resolvePavilionActivityDate(params: {
  filename: string;
  subject?: string | null;
  emailDate?: string | null;
  activityDate?: string | null;
}): string | null {
  if (params.activityDate && /^\d{4}-\d{2}-\d{2}$/.test(params.activityDate)) {
    return params.activityDate;
  }

  const receivedAtMs = params.emailDate ? new Date(params.emailDate).getTime() : null;

  // Un email puede traer muchos PDF: la fecha va en cada nombre de archivo, no en el asunto.
  const fromFilename = resolveActivityDate({
    subject: null,
    filename: params.filename,
    receivedAtMs: null,
  });
  if (fromFilename) return fromFilename;

  const fromSubject = resolveActivityDate({
    subject: params.subject,
    filename: null,
    receivedAtMs: null,
  });
  if (fromSubject) return fromSubject;

  return resolveActivityDate({
    subject: null,
    filename: null,
    receivedAtMs: receivedAtMs != null && Number.isFinite(receivedAtMs) ? receivedAtMs : null,
  });
}

/** Inserta o actualiza un PDF diario de actividades del pabellón. */
export async function ingestPavilionActivityPdf(
  supabase: SupabaseClient,
  params: IngestPavilionActivityParams,
): Promise<IngestPavilionActivityResult> {
  assertPdfBuffer(params.pdfBuffer);

  const normalizedFilename = params.filename?.trim() || 'actividades.pdf';
  const contentHash = hashPdf(params.pdfBuffer);
  // Para los correos, la fecha del nombre del PDF es obligatoria y autoritativa.
  // Evita atribuir archivos mal nombrados a la fecha de recepción.
  const activityDate =
    params.source === 'email'
      ? parseActivityDateFromText(normalizedFilename)
      : resolvePavilionActivityDate({
          filename: normalizedFilename,
          subject: params.subject,
          emailDate: params.emailDate,
          activityDate: params.activityDate,
        });

  if (!activityDate) {
    throw new Error('No se pudo inferir una fecha válida del PDF.');
  }

  if (params.source === 'email') {
    const storagePath = buildStoragePath(activityDate);

    // La recuperación del histórico es una operación manual separada.
    if (activityDate < '2026-10-26') {
      return {
        sheetId: '',
        activityDate,
        filePath: '',
        contentHash,
        skipped: true,
        skipReason: 'ignored_historical',
      };
    }

    // No reemplazar nunca, desde el correo, una hoja existente,
    // sea cual sea su hash o estado (pending, processing, processed, error).
    const { data: existing, error: existingError } = await supabase
      .from('pavilion_activity_sheets')
      .select('id, file_path')
      .eq('activity_date', activityDate)
      .maybeSingle();

    if (existingError) {
      throw new Error(`Fallo comprobando fecha existente: ${existingError.message}`);
    }

    if (existing) {
      return {
        sheetId: existing.id as string,
        activityDate,
        filePath: existing.file_path as string,
        contentHash,
        skipped: true,
        skipReason: 'deduplicated',
      };
    }

    // Protegemos también días que tienen ocupaciones PDF importadas
    // pero carecen de la fila original de pavilion_activity_sheets.
    const { data: existingOccupation, error: occupationError } = await supabase
      .from('activity_occurrences')
      .select('id')
      .eq('activity_date', activityDate)
      .eq('source_type', 'pdf')
      .limit(1)
      .maybeSingle();

    if (occupationError) {
      throw new Error(`Fallo comprobando ocupaciones existentes: ${occupationError.message}`);
    }

    if (existingOccupation) {
      return {
        sheetId: '',
        activityDate,
        filePath: '',
        contentHash,
        skipped: true,
        skipReason: 'existing_occupations',
      };
    }

    // INSERT (nunca UPSERT): el UNIQUE(activity_date) de Postgres
    // es la última protección frente a dos correos simultáneos.
    const { data: inserted, error: insertError } = await supabase
      .from('pavilion_activity_sheets')
      .insert({
        activity_date: activityDate,
        file_path: storagePath,
        source: 'email',
        gmail_message_id: params.gmailMessageId ?? null,
        original_filename: normalizedFilename,
        uploaded_by: null,
        content_hash: contentHash,
        processing_status: 'pending',
        processing_error: null,
        processed_at: null,
        updated_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (insertError?.code === '23505') {
      const { data: concurrent, error: concurrentError } = await supabase
        .from('pavilion_activity_sheets')
        .select('id, file_path')
        .eq('activity_date', activityDate)
        .maybeSingle();

      if (concurrentError || !concurrent) {
        throw new Error(
          `Conflicto de fecha sin registro recuperable: ${concurrentError?.message ?? activityDate}`,
        );
      }

      return {
        sheetId: concurrent.id as string,
        activityDate,
        filePath: concurrent.file_path as string,
        contentHash,
        skipped: true,
        skipReason: 'deduplicated',
      };
    }

    if (insertError || !inserted) {
      throw new Error(`Fallo creando PDF: ${insertError?.message ?? 'sin fila devuelta'}`);
    }

    // Nunca sobrescribir blobs existentes por la vía automática.
    const { error: uploadError } = await supabase.storage
      .from(PAVILION_ACTIVITIES_BUCKET)
      .upload(storagePath, params.pdfBuffer, {
        contentType: 'application/pdf',
        upsert: false,
      });

    if (uploadError) {
      // El PDF no está disponible: retirar solo la fila recién creada
      // para permitir un nuevo intento sin tocar contenido histórico.
      const { error: cleanupError } = await supabase
        .from('pavilion_activity_sheets')
        .delete()
        .eq('id', inserted.id)
        .eq('content_hash', contentHash);
      throw new Error(
        `Fallo Storage: ${uploadError.message}` +
          (cleanupError ? `; limpieza fallida: ${cleanupError.message}` : ''),
      );
    }

    return {
      sheetId: inserted.id as string,
      activityDate,
      filePath: storagePath,
      contentHash,
    };
  }

  // Deduplicación por contenido, no solo por Gmail message id. Los reenvíos del
  // mismo PDF pueden tener IDs de Gmail distintos.
  const { data: sameContent, error: sameContentError } = await supabase
    .from('pavilion_activity_sheets')
    .select('id, activity_date, file_path, processing_status')
    .eq('activity_date', activityDate)
    .eq('content_hash', contentHash)
    .maybeSingle();

  if (sameContentError) {
    throw new Error(`Fallo comprobando duplicado: ${sameContentError.message}`);
  }

  if (
    sameContent &&
    ['pending', 'processing', 'processed'].includes(
      String(sameContent.processing_status ?? ''),
    )
  ) {
    return {
      sheetId: sameContent.id as string,
      activityDate: sameContent.activity_date as string,
      filePath: sameContent.file_path as string,
      contentHash,
      skipped: true,
    };
  }

  const storagePath = buildStoragePath(activityDate);

  const { error: uploadError } = await supabase.storage
    .from(PAVILION_ACTIVITIES_BUCKET)
    .upload(storagePath, params.pdfBuffer, {
      contentType: 'application/pdf',
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Fallo Storage: ${uploadError.message}`);
  }

  const { data: sheet, error: upsertError } = await supabase
    .from('pavilion_activity_sheets')
    .upsert(
      {
        activity_date: activityDate,
        file_path: storagePath,
        source: params.source,
        gmail_message_id: params.gmailMessageId ?? null,
        original_filename: normalizedFilename,
        uploaded_by: params.uploadedBy ?? null,
        content_hash: contentHash,
        processing_status: 'pending',
        processing_error: null,
        processed_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'activity_date' },
    )
    .select('id')
    .single();

  if (upsertError || !sheet) {
    throw new Error(`Fallo BD: ${upsertError?.message ?? 'sin fila devuelta'}`);
  }

  return {
    sheetId: sheet.id as string,
    activityDate,
    filePath: storagePath,
    contentHash,
  };
}

export { madridIsoDateFromEpochMs };
