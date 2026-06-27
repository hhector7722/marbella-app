'use server';

import { createClient } from '@/utils/supabase/server';
import { isMasterDashboardUser } from '@/lib/master-dashboard';
import { PAVILION_ACTIVITIES_BUCKET } from '@/lib/pavilion-activities/ingest';
import { parsePdf, type Occupation } from '@/lib/pavilion/parser';
import { importOccupations, type ImportResult } from '@/lib/pavilion/importer';
import { preMatchOccupations, type MatchResult } from '@/lib/pavilion/matching';

export interface VenueOption {
  id: string;
  code: string;
}

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
    const email = session?.user?.email ?? '';
    if (!session?.user) {
      return { success: false, error: 'No autorizado' };
    }
    if (!isMasterDashboardUser(email)) {
      return { success: false, error: 'Solo Hector puede gestionar la importación de actividades.' };
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
    const email = session?.user?.email ?? '';
    if (!session?.user) {
      return { success: false, error: 'No autorizado' };
    }
    if (!isMasterDashboardUser(email)) {
      return { success: false, error: 'Solo Hector puede gestionar la importación de actividades.' };
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

export async function fetchVenuesAction(): Promise<
  { success: true; data: VenueOption[] } | { success: false; error: string }
> {
  try {
    const supabase = await createClient();
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData?.session?.user) {
      return { success: false, error: 'No autorizado' };
    }

    const { data, error } = await supabase
      .from('venues')
      .select('id, code')
      .order('code');

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: data as VenueOption[] };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error al obtener espacios';
    return { success: false, error: message };
  }
}

export async function getActivitiesByDateAction(params: {
  date: string;
}): Promise<{ success: true; data: ReviewData } | { success: false; error: string }> {
  try {
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user || !isMasterDashboardUser(session.user.email ?? '')) {
      return { success: false, error: 'No autorizado' };
    }

    const { data: occData, error: occError } = await supabase
      .from('activity_occurrences')
      .select(`
        activity_date,
        start_time,
        end_time,
        activities ( name ),
        occurrence_venues ( venues ( code ) )
      `)
      .eq('activity_date', params.date)
      .order('start_time', { ascending: true });

    if (occError) throw occError;

    const occupationsMap = new Map<string, Occupation>();

    for (const row of occData ?? []) {
      const actName = (row.activities as any)?.name ?? '';
      const start = row.start_time;
      const end = row.end_time;
      const key = `${actName}|${start}|${end}`;

      const venues = ((row.occurrence_venues as any) ?? []).map((ov: any) => ov.venues.code);

      if (!occupationsMap.has(key)) {
        occupationsMap.set(key, {
          activity: actName,
          start_time: start.substring(0, 5),
          end_time: end.substring(0, 5),
          venues: [...venues],
          date: params.date,
        });
      } else {
        const existing = occupationsMap.get(key)!;
        for (const v of venues) {
          if (!existing.venues.includes(v)) existing.venues.push(v);
        }
      }
    }

    const occupations = Array.from(occupationsMap.values());
    const matches = await preMatchOccupations(supabase, occupations);

    return {
      success: true,
      data: { occupations, date: params.date, matches, filename: null },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error al obtener actividades';
    return { success: false, error: message };
  }
}

export async function saveActivitiesAction(
  params: ConfirmImportParams,
): Promise<{ success: true; result: ImportResult } | { success: false; error: string }> {
  try {
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user || !isMasterDashboardUser(session.user.email ?? '')) {
      return { success: false, error: 'No autorizado' };
    }

    if (!params.date || !params.occupations?.length) {
      return { success: false, error: 'No hay datos para guardar. Agrega al menos una actividad.' };
    }

    // 1. Delete all occurrences for this date
    const { error: deleteError } = await supabase
      .from('activity_occurrences')
      .delete()
      .eq('activity_date', params.date);

    if (deleteError) throw deleteError;

    // 2. Import the new ones
    const result = await importOccupations(supabase, params.occupations);

    return { success: true, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error al guardar actividades';
    return { success: false, error: message };
  }
}
