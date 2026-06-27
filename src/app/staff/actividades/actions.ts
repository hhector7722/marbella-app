// src/app/staff/actividades/actions.ts
'use server';

import { createClient } from '@/utils/supabase/server';
import { isMasterDashboardUser } from '@/lib/master-dashboard';
import {
  ingestPavilionActivityPdf,
  PAVILION_ACTIVITIES_BUCKET,
} from '@/lib/pavilion-activities/ingest';

// ---------------------------------------------------------------------------
// Types and Interfaces (extending existing ones)
// ---------------------------------------------------------------------------

export type { BarActivity, DayCalendarData, DayDetail } from './types';

export interface VenueOption {
  id: string;
  code: string;
  name?: string;
}

export interface UnifiedActivity extends BarActivity {
  isUnified?: boolean;
  originalNames?: string[];
  modified?: boolean;
}

export interface ActivityConflict {
  activity1: UnifiedActivity;
  activity2: UnifiedActivity;
  similarity: number;
}

export interface UnifyResult {
  unified: UnifiedActivity[];
  conflicts?: ActivityConflict[];
}

export interface UpdateHoursParams {
  activityId: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  activityName?: string;
  activityIcon?: string | null;
}

// ---------------------------------------------------------------------------
// Utility Functions
// ---------------------------------------------------------------------------

function normalizeForMatch(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9\s]/g, '');
}

function similarityScore(a: string, b: string): number {
  const normA = normalizeForMatch(a);
  const normB = normalizeForMatch(b);
  
  if (normA === normB) return 1.0;
  if (!normA || !normB) return 0;

  const maxLen = Math.max(normA.length, normB.length);
  const longer = normA.length >= normB.length ? normA : normB;
  const shorter = normA.length < normB.length ? normA : normB;

  let matches = 0;
  for (let i = 0; i < shorter.length; i++) {
    for (let j = 0; j < longer.length; j++) {
      if (shorter[i] === longer[j]) {
        matches++;
        break;
      }
    }
  }

  return matches / maxLen;
}

function parseTime(timeStr: string): { hours: number; minutes: number } {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return { hours, minutes };
}

function formatTime(hours: number, minutes: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Unification Logic
// ---------------------------------------------------------------------------

export function unifyActivities(
  activities: BarActivity[],
  similarityThreshold: number = 0.8,
  venueOverlapThreshold: number = 0.5
): UnifyResult {
  const unified: UnifiedActivity[] = [];
  const conflicts: ActivityConflict[] = [];
  const processed = new Set<number>();

  for (let i = 0; i < activities.length; i++) {
    if (processed.has(i)) continue;

    const current = activities[i];
    const group = [current];
    processed.add(i);

    // Find similar activities
    for (let j = i + 1; j < activities.length; j++) {
      if (processed.has(j)) continue;

      const other = activities[j];
      const nameSim = similarityScore(current.activityName, other.activityName);
      
      // Check if activities share at least one venue
      const sharedVenues = current.venueCodes.filter(vc => other.venueCodes.includes(vc));
      const venueOverlap = sharedVenues.length / Math.max(current.venueCodes.length, other.venueCodes.length);

      if (nameSim >= similarityThreshold && venueOverlap >= venueOverlapThreshold) {
        // Merge activities - update the current one with merged data
        current.venueCodes = [...new Set([...current.venueCodes, ...other.venueCodes])];

        // Merge time ranges
        const curStart = parseTime(current.startTime);
        const curEnd = parseTime(current.endTime);
        const otherStart = parseTime(other.startTime);
        const otherEnd = parseTime(other.endTime);

        const startH = Math.min(curStart.hours, otherStart.hours);
        const startM = curStart.hours === otherStart.hours ? Math.min(curStart.minutes, otherStart.minutes) : 
          (curStart.hours < otherStart.hours ? curStart.minutes : otherStart.minutes);

        const endH = Math.max(curEnd.hours, otherEnd.hours);
        const endM = curEnd.hours === otherEnd.hours ? Math.max(curEnd.minutes, otherEnd.minutes) : 
          (curEnd.hours > otherEnd.hours ? curEnd.minutes : otherEnd.minutes);

        // Ensure minimum duration of 30 minutes and round to nearest 30 min
        const totalMinutes = endH * 60 + endM - (startH * 60 + startM);
        const roundedMinutes = Math.ceil(totalMinutes / 30) * 30;
        const newEndH = startH + Math.floor(roundedMinutes / 60);
        const newEndM = roundedMinutes % 60;

        current.startTime = formatTime(startH, startM);
        current.endTime = formatTime(newEndH, newEndM);

        // Keep the non-null icon if one is null
        if (current.activityIcon === null && other.activityIcon !== null) {
          current.activityIcon = other.activityIcon;
        }

        processed.add(j);
      } else {
        // Check if it's a potential conflict (high name similarity but no venue overlap)
        if (nameSim > 0.6 && sharedVenues.length === 0) {
          conflicts.push({
            activity1: { ...current, originalNames: [current.activityName] },
            activity2: { ...other, originalNames: [other.activityName] },
            similarity: nameSim,
          });
        }
      }
    }

    unified.push({
      ...current,
      isUnified: group.length > 1,
      originalNames: group.map(g => g.activityName),
      modified: false,
    });
  }

  return { unified, conflicts };
}

// ---------------------------------------------------------------------------
// Authentication Helper Functions
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Existing Activity Actions (unified and improved)
// ---------------------------------------------------------------------------

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
      `\n      activity_date,\n      start_time,\n      end_time,\n      activities ( name ),\n      activity_kinds ( icon ),\n      occurrence_venues ( venues ( code, affects_bar ) )\n    `,
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
    if (barVenues.length > 0) {
      byDate[d].barActivities.push({
        activityName: (row.activities as unknown as { name: string }).name,
        activityIcon: (row.activity_kinds as unknown as { icon: string | null } | null)?.icon ?? null,
        startTime: row.start_time as string,
        endTime: row.end_time as string,
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
      `\n      activity_date,\n      start_time,\n      end_time,\n      activities ( name ),\n      activity_kinds ( icon ),\n      occurrence_venues ( venues ( code, affects_bar ) )\n    `,
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
    if (barVenues.length > 0) {
      allActivities.push({
        activityName: (row.activities as unknown as { name: string }).name,
        activityIcon: (row.activity_kinds as unknown as { icon: string | null } | null)?.icon ?? null,
        startTime: row.start_time as string,
        endTime: row.end_time as string,
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
