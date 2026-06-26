'use server';

import { createClient } from '@/utils/supabase/server';
import { PAVILION_ACTIVITIES_BUCKET } from '@/lib/pavilion-activities/ingest';
import { parsePdf, type Occupation } from '@/lib/pavilion/parser';
import { importOccupations, type ImportResult } from '@/lib/pavilion/importer';
import { preMatchOccupations, type MatchResult } from '@/lib/pavilion/matching';

export interface ReviewData {
  occupations: Occupation[];
  date: string;
  matches: MatchResult[];
  filename: string | null;
}

export async function prepareReviewAction(params: {
  filePath: string;
}): Promise<{ success: true; data: ReviewData } | { success: false; error: string }> {
  try {
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      return { success: false, error: 'No autorizado' };
    }

    const filePath = params.filePath?.trim();
    if (!filePath || filePath.includes('..')) {
      return { success: false, error: 'Ruta de archivo no válida.' };
    }

    const filename = filePath.split('/').pop() ?? filePath;

    const { data: fileData, error: downloadError } = await supabase.storage
      .from(PAVILION_ACTIVITIES_BUCKET)
      .download(filePath);

    if (downloadError || !fileData) {
      return { success: false, error: `Error descargando PDF: ${downloadError?.message ?? 'archivo no encontrado'}` };
    }

    const buffer = Buffer.from(await fileData.arrayBuffer());
    const pdfBase64 = buffer.toString('base64');

    const { occupations, date } = await parsePdf(pdfBase64, filename);

    const matches = await preMatchOccupations(supabase, occupations);

    return {
      success: true,
      data: { occupations, date, matches, filename },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error al preparar revisión';
    return { success: false, error: message };
  }
}

export interface ConfirmImportParams {
  date: string;
  occupations: Occupation[];
}

export async function confirmImportAction(
  params: ConfirmImportParams,
): Promise<{ success: true; result: ImportResult } | { success: false; error: string }> {
  try {
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      return { success: false, error: 'No autorizado' };
    }

    if (!params.date || !params.occupations?.length) {
      return { success: false, error: 'No hay datos para importar.' };
    }

    const result = await importOccupations(supabase, params.occupations);

    return { success: true, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error al confirmar importación';
    return { success: false, error: message };
  }
}
