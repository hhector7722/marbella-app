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
      return NextResponse.json({ error: 'Payload incompleto (fileBase64, filename)' }, { status: 400 });
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

    // El PDF ya está guardado de forma durable. A partir de aquí no hacemos
    // esperar a Google Apps Script: respondemos 200 y dejamos el OCR/importación
    // ejecutándose en segundo plano dentro de la misma función de Vercel.
    //
    // Incluso si Storage ya tenía el PDF, repetimos la extracción para permitir
    // recuperar un intento anterior que hubiera fallado en OCR.
    after(async () => {
      try {
        const { parsePdf } = await import('@/lib/pavilion/parser');
        const { importOccupations } = await import('@/lib/pavilion/importer');

        const { occupations } = await parsePdf(fileBase64, filename);
        const dateToUse = result.activityDate;
        const occupationsWithDate = occupations.map((o) => ({ ...o, date: dateToUse }));

        // Reemplazamos las ocurrencias del día solo después de que el OCR haya
        // terminado correctamente. Así un fallo de Mistral no borra datos válidos.
        const { error: deleteError } = await supabase
          .from('activity_occurrences')
          .delete()
          .eq('activity_date', dateToUse);

        if (deleteError) {
          throw new Error(`Fallo eliminando actividades previas: ${deleteError.message}`);
        }

        if (occupationsWithDate.length > 0) {
          await importOccupations(supabase, occupationsWithDate);
        }

        console.log(
          `[webhooks/pavilion-activities] OCR/importación completados: ${filename} (${occupationsWithDate.length} ocupaciones)`,
        );
      } catch (parseError) {
        console.error(
          `[webhooks/pavilion-activities] Error OCR/importación en segundo plano para ${filename}:`,
          parseError,
        );
      }
    });

    return NextResponse.json(
      {
        success: true,
        accepted: true,
        processing: 'background',
        activityDate: result.activityDate,
        filePath: result.filePath,
        skippedStorage: Boolean(result.skipped),
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno';
    console.error('[webhooks/pavilion-activities]', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
