import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveActivityDate, madridIsoDateFromEpochMs } from '@/lib/pavilion-activities/date-parse';

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
  activityDate: string;
  filePath: string;
  skipped?: boolean;
};

function buildStoragePath(activityDate: string): string {
  return `${activityDate}/activity.pdf`;
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

  // Un email puede traer 14 PDF: la fecha va en cada nombre de archivo, no en el asunto.
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

  if (params.gmailMessageId) {
    const { data: existing } = await supabase
      .from('pavilion_activity_sheets')
      .select('id, activity_date, file_path')
      .eq('gmail_message_id', params.gmailMessageId)
      .eq('original_filename', normalizedFilename)
      .maybeSingle();

    if (existing) {
      return {
        activityDate: existing.activity_date as string,
        filePath: existing.file_path as string,
        skipped: true,
      };
    }
  }

  const activityDate = resolvePavilionActivityDate({
    filename: normalizedFilename,
    subject: params.subject,
    emailDate: params.emailDate,
    activityDate: params.activityDate,
  });

  if (!activityDate) {
    throw new Error('No se pudo inferir la fecha del PDF (asunto, nombre o fecha de email).');
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

  const { error: upsertError } = await supabase.from('pavilion_activity_sheets').upsert(
    {
      activity_date: activityDate,
      file_path: storagePath,
      source: params.source,
      gmail_message_id: params.gmailMessageId ?? null,
      original_filename: normalizedFilename,
      uploaded_by: params.uploadedBy ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'activity_date' },
  );

  if (upsertError) {
    throw new Error(`Fallo BD: ${upsertError.message}`);
  }

  return { activityDate, filePath: storagePath };
}

export { madridIsoDateFromEpochMs };
