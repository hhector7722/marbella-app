import { after, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ingestPavilionActivityPdf } from '@/lib/pavilion-activities/ingest';

export const maxDuration = 300;

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('supabaseKey is required.');
  }
  return createClient(url, key);
}

/** Webhook para Google Apps Script — PDF diario de actividades del pabellón. */
export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.WEBHOOK_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const fileBase64 = typeof body.fileBase64 === 'string' ? body.fileBase64 : '';
    const filename = typeof body.filename === 'string' ? body.filename.trim() : '';
    const emailDate = typeof body.emailDate === 'string' ? body.emailDate : null;
    const subject = typeof body.subject === 'string' ? body.subject : null;
    const activityDate =
      typeof body.activityDate === 'string' ? body.activityDate.trim() : null;
    const gmailMessageId =
      typeof body.gmailMessageId === 'string' ? body.gmailMessageId.trim() : null;

    if (!fileBase64 || !filename) {
      return NextResponse.json(
        { error: 'Payload incompleto (fileBase64, filename)' },
        { status: 400 },
      );
    }

    const pdfBuffer = Buffer.from(fileBase64, 'base64');
    const supabase = getServiceSupabase();

    const result = await ingestPavilionActivityPdf(supabase, {
      pdfBuffer,
      filename,
      subject,
      emailDate,
      activityDate,
      gmailMessageId,
      source: 'email',
    });

    // Si este mismo PDF ya está pendiente, procesándose o procesado, no lanzamos
    // un segundo OCR. Esto evita duplicados por reenvíos del mismo correo/archivo.
    if (result.skipped) {
      return NextResponse.json(
        {
          success: true,
          accepted: true,
          processing: 'deduplicated',
          activityDate: result.activityDate,
          filePath: result.filePath,
        },
        { status: 200 },
      );
    }

    // El PDF ya está guardado de forma durable. Respondemos a Apps Script sin
    // esperar al análisis visual y continuamos dentro de la función de Vercel.
    after(async () => {
      const dateToUse = result.activityDate;

      try {
        // Solo procesamos si esta fila sigue correspondiendo al PDF que acaba de
        // llegar. Si durante el OCR ha llegado una versión más nueva del mismo día,
        // la antigua se abandona y nunca sobrescribe datos nuevos.
        const { data: before, error: beforeError } = await supabase
          .from('pavilion_activity_sheets')
          .select('content_hash, processing_attempts')
          .eq('id', result.sheetId)
          .single();

        if (beforeError || !before) {
          throw new Error(
            `No se pudo leer el estado de procesamiento: ${beforeError?.message ?? 'fila inexistente'}`,
          );
        }

        if (before.content_hash !== result.contentHash) {
          console.log(
            `[webhooks/pavilion-activities] PDF obsoleto ignorado: ${filename}`,
          );
          return;
        }

        const attempts = Number(before.processing_attempts ?? 0) + 1;
        const { error: processingError } = await supabase
          .from('pavilion_activity_sheets')
          .update({
            processing_status: 'processing',
            processing_error: null,
            processing_attempts: attempts,
          })
          .eq('id', result.sheetId)
          .eq('content_hash', result.contentHash);

        if (processingError) {
          throw new Error(
            `No se pudo marcar el PDF como processing: ${processingError.message}`,
          );
        }

        const { parsePdf } = await import('@/lib/pavilion/parser');
        const { importOccupations } = await import('@/lib/pavilion/importer');

        const { occupations } = await parsePdf(fileBase64, filename);

        // Un PDF de planificación aceptado con cero actividades es sospechoso.
        // Nunca borramos datos válidos por una extracción vacía.
        if (occupations.length === 0) {
          throw new Error('Mistral no extrajo ninguna ocupación del PDF.');
        }

        // Verificación anti-carrera justo antes de escribir en las tablas finales.
        const { data: current, error: currentError } = await supabase
          .from('pavilion_activity_sheets')
          .select('content_hash')
          .eq('id', result.sheetId)
          .single();

        if (currentError || !current) {
          throw new Error(
            `No se pudo verificar la versión del PDF: ${currentError?.message ?? 'fila inexistente'}`,
          );
        }

        if (current.content_hash !== result.contentHash) {
          console.log(
            `[webhooks/pavilion-activities] Resultado OCR obsoleto descartado: ${filename}`,
          );
          return;
        }

        const occupationsWithDate = occupations.map((o) => ({
          ...o,
          date: dateToUse,
        }));

        // importOccupations elimina únicamente las ocurrencias PDF del día y las
        // sustituye por el resultado validado.
        await importOccupations(
          supabase,
          occupationsWithDate,
          result.sheetId,
        );

        const { error: completedError } = await supabase
          .from('pavilion_activity_sheets')
          .update({
            processing_status: 'processed',
            processing_error: null,
            processed_at: new Date().toISOString(),
          })
          .eq('id', result.sheetId)
          .eq('content_hash', result.contentHash);

        if (completedError) {
          throw new Error(
            `OCR importado pero no se pudo guardar el estado final: ${completedError.message}`,
          );
        }

        console.log(
          `[webhooks/pavilion-activities] OCR/importación completados: ${filename} (${occupationsWithDate.length} ocupaciones)`,
        );
      } catch (parseError) {
        const message =
          parseError instanceof Error ? parseError.message : String(parseError);

        console.error(
          `[webhooks/pavilion-activities] Error OCR/importación en segundo plano para ${filename}:`,
          parseError,
        );

        await supabase
          .from('pavilion_activity_sheets')
          .update({
            processing_status: 'error',
            processing_error: message.slice(0, 4000),
          })
          .eq('id', result.sheetId)
          .eq('content_hash', result.contentHash);
      }
    });

    return NextResponse.json(
      {
        success: true,
        accepted: true,
        processing: 'background',
        activityDate: result.activityDate,
        filePath: result.filePath,
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno';
    console.error('[webhooks/pavilion-activities]', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
