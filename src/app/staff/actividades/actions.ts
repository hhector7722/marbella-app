'use server';

import { createClient } from '@/utils/supabase/server';
import { isMasterDashboardUser } from '@/lib/master-dashboard';
import {
  ingestPavilionActivityPdf,
  PAVILION_ACTIVITIES_BUCKET,
} from '@/lib/pavilion-activities/ingest';

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
    .from(PAVILION_ACTIVITIES_BUCKET)
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

  if (buffer.length > MAX_BYTES) {
    return { success: false, error: 'El PDF supera el límite de 10 MB.' };
  }

  try {
    const result = await ingestPavilionActivityPdf(auth.supabase, {
      pdfBuffer: buffer,
      filename: filename?.trim() || 'manual.pdf',
      activityDate,
      source: 'manual',
      uploadedBy: auth.userId,
    });
    return { success: true, filePath: result.filePath };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error al subir el PDF.';
    return { success: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// Calendar & Day Detail (nuevo calendario operativo)
// ---------------------------------------------------------------------------

export interface BarActivity {
  activityName: string;
  activityIcon: string | null;
  activityColor: string | null;
  startTime: string;
  endTime: string;
  formStartTime: string | null;
  formEndTime: string | null;
  totalParticipants: number | null;
  categories: string[];
  venueCodes: string[];
}

export interface DayCalendarData {
  date: string;
  totalCount: number;
  barActivities: BarActivity[];
}

export interface DayDetail {
  date: string;
  barActivities: BarActivity[];
  hasPdf: boolean;
  pdfFilePath: string | null;
  pdfFilename: string | null;
  summary: {
    totalCount: number;
    barCount: number;
    uniqueVenues: number;
    peakHour: string;
    peakCount: number;
    venueUsage: { code: string; hours: number }[];
    hourlyBreakdown: { hour: string; count: number }[];
  };
}

function buildHourlyBreakdown(
  activities: BarActivity[],
): { hour: string; count: number }[] {
  const slots: Record<string, number> = {};
  for (const act of activities) {
    const startH = parseInt(act.startTime.split(':')[0] ?? '0', 10);
    const endH = parseInt(act.endTime.split(':')[0] ?? '0', 10);
    for (let h = startH; h < endH; h++) {
      const key = `${String(h).padStart(2, '0')}:00-${String(h + 1).padStart(2, '0')}:00`;
      slots[key] = (slots[key] ?? 0) + 1;
    }
  }
  return Object.entries(slots)
    .map(([hour, count]) => ({ hour, count }))
    .sort((a, b) => a.hour.localeCompare(b.hour));
}

function buildVenueUsage(
  activities: BarActivity[],
): { code: string; hours: number }[] {
  const usage: Record<string, number> = {};
  for (const act of activities) {
    const duration =
      (parseInt(act.endTime.split(':')[0] ?? '0', 10) +
        parseInt(act.endTime.split(':')[1] ?? '0', 10) / 60) -
      (parseInt(act.startTime.split(':')[0] ?? '0', 10) +
        parseInt(act.startTime.split(':')[1] ?? '0', 10) / 60);
    for (const code of act.venueCodes) {
      usage[code] = (usage[code] ?? 0) + Math.max(0, duration);
    }
  }
  return Object.entries(usage)
    .map(([code, hours]) => ({ code, hours: Math.round(hours * 10) / 10 }))
    .sort((a, b) => b.hours - a.hours);
}

export async function fetchActivitiesForRangeAction(params: {
  startDate: string;
  endDate: string;
}): Promise<
  | { success: true; byDate: Record<string, DayCalendarData> }
  | { success: false; error: string }
> {
  const auth = await requireAuthenticated();
  if (!auth.ok) return { success: false, error: auth.error };

  const { startDate, endDate } = params;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(endDate)
  ) {
    return { success: false, error: 'Rango de fechas no válido.' };
  }

  const { data, error } = await auth.supabase
    .from('activity_occurrences')
    .select(
      `
      activity_date,
      start_time,
      end_time,
      form_start_time,
      form_end_time,
      preferred_start_time,
      preferred_end_time,
      total_participants,
      activities ( name, color ),
      activity_kinds ( icon ),
      occurrence_venues ( venues ( code, affects_bar ) ),
      occurrence_groups ( participants, participant_categories ( name ) )
    `,
    )
    .gte('activity_date', startDate)
    .lte('activity_date', endDate)
    .order('activity_date', { ascending: true })
    .order('start_time', { ascending: true });

  if (error) {
    return { success: false, error: error.message ?? 'Error al cargar datos.' };
  }

  const byDate: Record<string, DayCalendarData> = {};

  for (const row of data ?? []) {
    const d = row.activity_date as string;
    if (!byDate[d]) {
      byDate[d] = { date: d, totalCount: 0, barActivities: [] };
    }
    byDate[d].totalCount++;
    const venues =
      (row.occurrence_venues as unknown as {
        venues: { code: string; affects_bar: boolean };
      }[])?.map((ov) => ov.venues) ?? [];

    const barVenues = venues.filter((v) => v.affects_bar);
    const hasFormTimes = (row as any).form_start_time !== null;
    const hasFormPref = (row as any).preferred_start_time === 'form';
    if (barVenues.length > 0 || hasFormTimes || hasFormPref) {
      const prefStart = (row as any).preferred_start_time as string;
      const prefEnd = (row as any).preferred_end_time as string;
      const formStart = (row as any).form_start_time as string | null;
      const formEnd = (row as any).form_end_time as string | null;
      const totalParticipants = (row as any).total_participants as number | null;
      const occurrenceGroups = (row as any).occurrence_groups as any[] || [];
      const categories = occurrenceGroups.map((g: any) => g.participant_categories?.name).filter(Boolean);

      const finalStart = (prefStart === 'form' && formStart) ? formStart : (row.start_time as string);
      const finalEnd = (prefEnd === 'form' && formEnd) ? formEnd : (row.end_time as string);

      byDate[d].barActivities.push({
        activityName: (row.activities as unknown as { name: string; color: string | null }).name,
        activityIcon: (row.activity_kinds as unknown as { icon: string | null } | null)?.icon ?? null,
        activityColor: (row.activities as unknown as { name: string; color: string | null }).color ?? null,
        startTime: finalStart,
        endTime: finalEnd,
        formStartTime: formStart,
        formEndTime: formEnd,
        totalParticipants,
        categories,
        venueCodes: barVenues.map((v) => v.code),
      });
    }
  }

  return { success: true, byDate };
}

export async function fetchDayDetailAction(params: {
  date: string;
}): Promise<{ success: true; data: DayDetail } | { success: false; error: string }> {
  const auth = await requireAuthenticated();
  if (!auth.ok) return { success: false, error: auth.error };

  const { date } = params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { success: false, error: 'Fecha no válida.' };
  }

  const { data: occData, error: occError } = await auth.supabase
    .from('activity_occurrences')
    .select(
      `
      activity_date,
      start_time,
      end_time,
      form_start_time,
      form_end_time,
      preferred_start_time,
      preferred_end_time,
      total_participants,
      activities ( name, color ),
      activity_kinds ( icon ),
      occurrence_venues ( venues ( code, affects_bar ) ),
      occurrence_groups ( participants, participant_categories ( name ) )
    `,
    )
    .eq('activity_date', date)
    .order('start_time', { ascending: true });

  if (occError) {
    return { success: false, error: occError.message ?? 'Error al cargar el día.' };
  }

  const allActivities: BarActivity[] = [];
  let totalCount = 0;

  for (const row of occData ?? []) {
    totalCount++;
    const venues =
      (row.occurrence_venues as unknown as {
        venues: { code: string; affects_bar: boolean };
      }[])?.map((ov) => ov.venues) ?? [];

    const barVenues = venues.filter((v) => v.affects_bar);
    const hasFormTimes = (row as any).form_start_time !== null;
    const hasFormPref = (row as any).preferred_start_time === 'form';
    if (barVenues.length > 0 || hasFormTimes || hasFormPref) {
      const prefStart = (row as any).preferred_start_time as string;
      const prefEnd = (row as any).preferred_end_time as string;
      const formStart = (row as any).form_start_time as string | null;
      const formEnd = (row as any).form_end_time as string | null;
      const totalParticipants = (row as any).total_participants as number | null;
      const occurrenceGroups = (row as any).occurrence_groups as any[] || [];
      const categories = occurrenceGroups.map((g: any) => g.participant_categories?.name).filter(Boolean);

      const finalStart = (prefStart === 'form' && formStart) ? formStart : (row.start_time as string);
      const finalEnd = (prefEnd === 'form' && formEnd) ? formEnd : (row.end_time as string);

      allActivities.push({
        activityName: (row.activities as unknown as { name: string; color: string | null }).name,
        activityIcon: (row.activity_kinds as unknown as { icon: string | null } | null)?.icon ?? null,
        activityColor: (row.activities as unknown as { name: string; color: string | null }).color ?? null,
        startTime: finalStart,
        endTime: finalEnd,
        formStartTime: formStart,
        formEndTime: formEnd,
        totalParticipants,
        categories,
        venueCodes: barVenues.map((v) => v.code),
      });
    }
  }

  const hourlyBreakdown = buildHourlyBreakdown(allActivities);
  const peakEntry = hourlyBreakdown.reduce(
    (max, h) => (h.count > max.count ? h : max),
    { hour: '', count: 0 },
  );

  const venueUsage = buildVenueUsage(allActivities);

  // Check for PDF
  const { data: sheetData } = await auth.supabase
    .from('pavilion_activity_sheets')
    .select('file_path, original_filename')
    .eq('activity_date', date)
    .maybeSingle();

  const hasPdf = !!sheetData?.file_path;
  const pdfFilePath = (sheetData?.file_path as string) ?? null;
  const pdfFilename = (sheetData?.original_filename as string) ?? null;

  return {
    success: true,
    data: {
      date,
      barActivities: allActivities,
      hasPdf,
      pdfFilePath,
      pdfFilename,
      summary: {
        totalCount,
        barCount: allActivities.length,
        uniqueVenues: new Set(allActivities.flatMap((a) => a.venueCodes)).size,
        peakHour: peakEntry.hour,
        peakCount: peakEntry.count,
        venueUsage,
        hourlyBreakdown,
      },
    },
  };
}

export async function deletePavilionActivityAction(params: {
  activityDate: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  const auth = await requireMasterUpload();
  if (!auth.ok) return { success: false, error: auth.error };

  const { activityDate } = params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(activityDate)) {
    return { success: false, error: 'Fecha no válida.' };
  }

  const { data: row, error: fetchError } = await auth.supabase
    .from('pavilion_activity_sheets')
    .select('file_path')
    .eq('activity_date', activityDate)
    .maybeSingle();

  if (fetchError) {
    return { success: false, error: fetchError.message ?? 'Error al buscar la hoja.' };
  }
  if (!row?.file_path) {
    return { success: false, error: 'No hay PDF para este día.' };
  }

  const filePath = row.file_path as string;
  if (filePath.includes('..')) {
    return { success: false, error: 'Ruta de archivo no válida.' };
  }

  const { error: storageError } = await auth.supabase.storage
    .from(PAVILION_ACTIVITIES_BUCKET)
    .remove([filePath]);

  if (storageError) {
    return { success: false, error: storageError.message ?? 'Error al eliminar el archivo.' };
  }

  const { error: deleteError } = await auth.supabase
    .from('pavilion_activity_sheets')
    .delete()
    .eq('activity_date', activityDate);

  if (deleteError) {
    return { success: false, error: deleteError.message ?? 'Error al eliminar el registro.' };
  }

  return { success: true };
}
