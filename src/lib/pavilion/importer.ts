// src/lib/pavilion/importer.ts
// ------------------------------------------------------------
// Importador de ocupaciones del pabellón a Supabase.
//
// Responsabilidad:
//   1. Recibir JSON de ocupaciones (desde el parser)
//   2. Buscar actividad por external_name (crear si no existe)
//   3. Buscar venue por code (crear si no existe)
//   4. Crear activity_occurrences
//   5. Crear occurrence_venues
//
// Idempotencia:
//   Usa delete_activity_occurrences_by_date(date) para borrar
//   ocurrencias previas del mismo día antes de insertar.
// ------------------------------------------------------------

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Occupation } from './parser';

export interface ImportResult {
  date: string;
  activitiesCreated: number;
  venuesCreated: number;
  occurrencesInserted: number;
  occurrenceVenuesInserted: number;
}

// ---------------------------------------------------------------------------
// Helpers de normalización
// ---------------------------------------------------------------------------

function normalizeForMatch(str: string): string {
  return str.trim().toLowerCase().replace(/\s+/g, ' ');
}

// ---------------------------------------------------------------------------
// Activity: buscar por external_name | crear si no existe
// ---------------------------------------------------------------------------

async function resolveActivity(
  supabase: SupabaseClient,
  rawName: string,
  color?: string,
): Promise<{ id: string; wasCreated: boolean }> {
  const normalized = normalizeForMatch(rawName);

  let existing = await supabase
    .from('activities')
    .select('id, color')
    .ilike('external_name', normalized)
    .maybeSingle()
    .then(r => r.data);

  if (!existing) {
    const byName = await supabase
      .from('activities')
      .select('id, color')
      .ilike('name', normalized)
      .maybeSingle();
    existing = byName.data;
  }

  if (existing) {
    if (color !== undefined && existing.color !== color) {
      await supabase.from('activities').update({ color: color || null }).eq('id', existing.id);
    }
    return { id: existing.id as string, wasCreated: false };
  }

  const trimmed = rawName.trim();

  const { data, error } = await supabase
    .from('activities')
    .insert({
      name: trimmed,
      external_name: trimmed,
      active: true,
      color: color || null,
    })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(`Error creant activity "${trimmed}": ${error?.message}`);
  }

  return { id: data.id as string, wasCreated: true };
}

// ---------------------------------------------------------------------------
// Venue: buscar por code | crear si no existe
// ---------------------------------------------------------------------------

async function resolveVenue(
  supabase: SupabaseClient,
  rawCode: string,
): Promise<{ id: string; wasCreated: boolean }> {
  const code = rawCode.trim().toUpperCase();

  const { data: existing } = await supabase
    .from('venues')
    .select('id')
    .ilike('code', code)
    .maybeSingle();

  if (existing) return { id: existing.id as string, wasCreated: false };

  const { data, error } = await supabase
    .from('venues')
    .insert({
      code,
      name: code,
      active: true,
    })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(`Error creant venue "${code}": ${error?.message}`);
  }

  return { id: data.id as string, wasCreated: true };
}

// ---------------------------------------------------------------------------
// Importador principal
// ---------------------------------------------------------------------------

/**
 * Importa ocupaciones a Supabase.
 *
 * @param supabase - Cliente de Supabase (debe tener permisos de escritura)
 * @param occupations - Lista de ocupaciones del parser
 * @param sourcePdfId - ID opcional de la fila pavilion_activity_sheets
 */
export async function importOccupations(
  supabase: SupabaseClient,
  occupations: Occupation[],
  sourcePdfId?: string,
): Promise<ImportResult> {
  if (occupations.length === 0) {
    return {
      date: '',
      activitiesCreated: 0,
      venuesCreated: 0,
      occurrencesInserted: 0,
      occurrenceVenuesInserted: 0,
    };
  }

  const date = occupations[0]!.date;

  // --------------------------------------------------
  // 1. Idempotencia: eliminar ocurrencies anteriors
  // --------------------------------------------------
  // Intentar via RPC (existeix si les migracions estan aplicades),
  // si no funciona, esborrar directament amb service_role.
  let deleteError: { message: string } | null = null;
  try {
    const rpcResult = await supabase.rpc(
      'delete_activity_occurrences_by_date',
      { target_date: date },
    );
    deleteError = rpcResult.error;
  } catch {
    deleteError = { message: 'RPC not found' };
  }

  if (deleteError) {
    // Fallback: esborrat directe (requereix service_role)
    const { error: directError } = await supabase
      .from('activity_occurrences')
      .delete()
      .eq('activity_date', date)
      .eq('source_type', 'pdf');

    if (directError) {
      throw new Error(
        `Error eliminant ocurrencies anteriors: ${directError.message}`,
      );
    }
  }

  // --------------------------------------------------
  // 2. Resoldre activities i venues
  // --------------------------------------------------
  let activitiesCreated = 0;
  let venuesCreated = 0;
  const venuesCache = new Map<string, string>(); // code → venue_id

  interface ResolvedOccupation {
    activityId: string;
    startTime: string;
    endTime: string;
    venueIds: string[];
    formStartTime?: string | null;
    formEndTime?: string | null;
    preferredStartTime?: 'pdf' | 'form';
    preferredEndTime?: 'pdf' | 'form';
    totalParticipants?: number | null;
    occurrenceGroups?: { category_id: string; name: string }[];
  }

  const resolved: ResolvedOccupation[] = [];

  for (const occ of occupations) {
    // Activity
    const { id: activityId, wasCreated: actCreated } = await resolveActivity(
      supabase,
      occ.activity,
      occ.color,
    );
    if (actCreated) activitiesCreated++;

    // Venues
    const venueIds: string[] = [];
    for (const v of occ.venues) {
      let vid = venuesCache.get(v.trim().toUpperCase());
      if (!vid) {
        const { id, wasCreated: venCreated } = await resolveVenue(supabase, v);
        vid = id;
        venuesCache.set(v.trim().toUpperCase(), id);
        if (venCreated) venuesCreated++;
      }
      venueIds.push(vid);
    }

    resolved.push({
      activityId,
      startTime: occ.start_time,
      endTime: occ.end_time,
      venueIds,
      formStartTime: occ.form_start_time,
      formEndTime: occ.form_end_time,
      preferredStartTime: occ.preferred_start_time,
      preferredEndTime: occ.preferred_end_time,
      totalParticipants: occ.total_participants,
      occurrenceGroups: occ.occurrence_groups,
    });
  }

  // --------------------------------------------------
  // 3. Inserir activity_occurrences
  // --------------------------------------------------
  let occurrencesInserted = 0;
  let occurrenceVenuesInserted = 0;

  for (const row of resolved) {
    const insertData: Record<string, unknown> = {
      activity_id: row.activityId,
      activity_date: date,
      start_time: row.startTime,
      end_time: row.endTime,
      source_type: 'pdf',
      form_start_time: row.formStartTime || null,
      form_end_time: row.formEndTime || null,
      preferred_start_time: row.preferredStartTime || 'pdf',
      preferred_end_time: row.preferredEndTime || 'pdf',
      total_participants: row.totalParticipants || null,
    };
    if (sourcePdfId) {
      insertData.source_pdf_id = sourcePdfId;
    }

    const { data: occData, error: occError } = await supabase
      .from('activity_occurrences')
      .insert(insertData)
      .select('id')
      .single();

    if (occError || !occData) {
      throw new Error(`Error inserint occurrence: ${occError?.message}`);
    }

    const occurrenceId = occData.id as string;
    occurrencesInserted++;

    // --------------------------------------------------
    // Insert occurrence_groups (categories)
    // --------------------------------------------------
    if (row.occurrenceGroups && row.occurrenceGroups.length > 0) {
      const groupRows = row.occurrenceGroups.map((g) => ({
        occurrence_id: occurrenceId,
        category_id: g.category_id,
        participants: row.totalParticipants || 0,
      }));

      const { error: gError } = await supabase
        .from('occurrence_groups')
        .insert(groupRows);

      if (gError) {
        throw new Error(
          `Error inserint occurrence_groups: ${gError.message}`,
        );
      }
    }

    // --------------------------------------------------
    // 4. Inserir occurrence_venues
    // --------------------------------------------------
    if (row.venueIds.length > 0) {
      const venueRows = row.venueIds.map((venueId) => ({
        occurrence_id: occurrenceId,
        venue_id: venueId,
      }));

      const { error: vError } = await supabase
        .from('occurrence_venues')
        .insert(venueRows);

      if (vError) {
        throw new Error(
          `Error inserint occurrence_venues: ${vError.message}`,
        );
      }

      occurrenceVenuesInserted += row.venueIds.length;
    }
  }

  return {
    date,
    activitiesCreated,
    venuesCreated,
    occurrencesInserted,
    occurrenceVenuesInserted,
  };
}
