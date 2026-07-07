'use server';

import { createClient } from '@supabase/supabase-js';

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Supabase environment variables are missing.');
  }
  return createClient(url, key);
}

export interface ReportePayload {
  data: string;
  activitat: string;
  hora_convocatoria: string;
  hora_finalitzacio: string;
  selected_category_ids: string[];
  total_participants: number;
}

export async function submitReporteAction(payloads: ReportePayload[]) {
  try {
    const supabase = getServiceSupabase();

    for (const item of payloads) {
      if (!item.data || !item.activitat) continue;

      const actName = item.activitat.trim();

      const { data: act } = await supabase
        .from('activities')
        .select('id')
        .ilike('name', actName)
        .maybeSingle();

      let actId = act?.id;
      if (!actId) {
        // Create new manual activity
        const { data: newAct, error: createErr } = await supabase
          .from('activities')
          .insert({ name: actName, is_active: true })
          .select('id')
          .single();
          
        if (createErr || !newAct) {
          console.warn(`Could not create activity "${actName}"`, createErr);
          continue;
        }
        actId = newAct.id;
      }

      const { data: existingOccs } = await supabase
        .from('activity_occurrences')
        .select('id')
        .eq('activity_id', actId)
        .eq('activity_date', item.data);

      const startTime = item.hora_convocatoria.length === 5
        ? `${item.hora_convocatoria}:00`
        : item.hora_convocatoria;
      const endTime = item.hora_finalitzacio.length === 5
        ? `${item.hora_finalitzacio}:00`
        : item.hora_finalitzacio;

      let occurrenceIds = existingOccs?.map(o => o.id) || [];

      if (occurrenceIds.length === 0) {
        // Create a new occurrence for manual entries
        const { data: newOcc, error: occErr } = await supabase
          .from('activity_occurrences')
          .insert({
            activity_id: actId,
            activity_date: item.data,
            form_start_time: startTime || null,
            form_end_time: endTime || null,
            preferred_start_time: 'form',
            preferred_end_time: 'form',
            total_participants: item.total_participants || null
          })
          .select('id')
          .single();

        if (occErr || !newOcc) {
          console.warn(`Could not create occurrence for "${actName}" on date ${item.data}`, occErr);
          continue;
        }
        occurrenceIds = [newOcc.id];
      }

      for (const occurrenceId of occurrenceIds) {

        const { error: updateErr } = await supabase
          .from('activity_occurrences')
          .update({
            form_start_time: startTime || null,
            form_end_time: endTime || null,
            preferred_start_time: 'form',
            preferred_end_time: 'form',
            total_participants: item.total_participants || null,
          })
          .eq('id', occurrenceId);

        if (updateErr) {
          console.error('Error updating occurrence:', updateErr);
          continue;
        }

        const { error: deleteGroupsErr } = await supabase
          .from('occurrence_groups')
          .delete()
          .eq('occurrence_id', occurrenceId);

        if (deleteGroupsErr) {
          console.error('Error deleting occurrence_groups:', deleteGroupsErr);
        }

        const groupsToInsert = (item.selected_category_ids || [])
          .filter(catId => catId)
          .map(catId => ({
            occurrence_id: occurrenceId,
            category_id: catId,
            participants: item.total_participants || 0,
            group_label: null,
          }));

        if (groupsToInsert.length > 0) {
          const { error: insertGroupsErr } = await supabase
            .from('occurrence_groups')
            .insert(groupsToInsert);

          if (insertGroupsErr) {
            console.error('Error inserting occurrence_groups:', insertGroupsErr);
          }
        }
      }
    }

    return { success: true };
  } catch (error) {
    console.error('submitReporteAction error:', error);
    return { success: false, error: 'Internal Server Error' };
  }
}

export async function getDailyActivitiesAction(date: string) {
  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from('activity_occurrences')
      .select('activities(name), occurrence_venues(venues(code))')
      .eq('activity_date', date);

    if (error) {
      console.error('Error fetching daily activities:', error);
      return [];
    }

    const names = new Set<string>();
    data?.forEach(row => {
      const name = (row.activities as any)?.name;
      if (!name) return;

      const venues = (row.occurrence_venues as any[] || []).map(v => v.venues?.code?.toUpperCase() || '');
      
      // If no venues, it might be a manually added occurrence with no space assigned yet, allow it.
      if (venues.length === 0) {
        names.add(name);
        return;
      }
      
      // Check if it occupies P1, P2, P3, or P4
      const allowed = venues.some(code => 
        code.startsWith('P1') || code.startsWith('P2') || code.startsWith('P3') || code.startsWith('P4') ||
        code.startsWith('PISTA 1') || code.startsWith('PISTA 2') || code.startsWith('PISTA 3') || code.startsWith('PISTA 4')
      );
      
      if (allowed) {
        names.add(name);
      }
    });

    return Array.from(names).sort((a, b) => a.localeCompare(b));
  } catch (err) {
    console.error(err);
    return [];
  }
}

export async function getTopActivityAction(date: string) {
  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from('activity_occurrences')
      .select('activity_id, activities(name)')
      .eq('activity_date', date);

    if (error || !data || data.length === 0) {
      return null;
    }

    const counts: Record<string, { count: number; name: string }> = {};
    for (const row of data) {
      const id = row.activity_id as string;
      const name = (row.activities as any)?.name as string;
      if (!id || !name) continue;
      if (!counts[id]) counts[id] = { count: 0, name };
      counts[id].count++;
    }

    let topActivity: string | null = null;
    let maxCount = 0;

    for (const id in counts) {
      if (counts[id].count > maxCount) {
        maxCount = counts[id].count;
        topActivity = counts[id].name;
      }
    }

    return topActivity;
  } catch (err) {
    console.error(err);
    return null;
  }
}

export async function getAllActivitiesAction() {
  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from('activities')
      .select('name')
      .eq('is_active', true)
      .order('name');

    if (error) {
      if (error.code === '42703') {
        const { data: dataFallback, error: errFallback } = await supabase
          .from('activities')
          .select('name')
          .order('name');
        if (errFallback) return [];
        return (dataFallback || []).map(r => r.name);
      }
      return [];
    }

    return (data || []).map(r => r.name);
  } catch (err) {
    console.error(err);
    return [];
  }
}

export async function getParticipantCategoriesAction() {
  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from('participant_categories')
      .select('id, name')
      .order('name');

    if (error) return [];
    
    // Normalize names to Catalan
    const normalizedData = (data as { id: string; name: string }[]).map(cat => {
      let n = cat.name.trim().toLowerCase();
      
      if (n === 'prebenjamin' || n === 'prebenjamí') n = 'Prebenjamí';
      else if (n === 'benjamin' || n === 'benjamí') n = 'Benjamí';
      else if (n === 'alevin' || n === 'aleví') n = 'Aleví';
      else if (n === 'infantil' || n === 'joves') n = 'Infantil';
      else if (n === 'cadete' || n === 'cadet') n = 'Cadet';
      else if (n === 'juvenil') n = 'Juvenil';
      else if (n === 'senior' || n === 'sènior') n = 'Senior';
      else if (n === 'junior' || n === 'veterans' || n === 'master' || n === 'màster') n = 'Veterans';
      else n = n.charAt(0).toUpperCase() + n.slice(1);

      return { ...cat, name: n };
    });

    const orderMap: Record<string, number> = {
      'Prebenjamí': 1,
      'Benjamí': 2,
      'Aleví': 3,
      'Infantil': 4,
      'Cadet': 5,
      'Juvenil': 6,
      'Senior': 7,
      'Veterans': 8,
    };

    // Filter duplicates if any got merged (e.g. junior and master both becoming Veterans)
    // Wait, the IDs are unique. We should return all IDs. 
    // If they select 'Veterans', it will check both IDs which is fine.
    
    normalizedData.sort((a, b) => {
      const orderA = orderMap[a.name] || 99;
      const orderB = orderMap[b.name] || 99;
      if (orderA !== orderB) return orderA - orderB;
      return a.name.localeCompare(b.name);
    });

    return normalizedData;
  } catch (err) {
    console.error(err);
    return [];
  }
}

export async function updatePreferredTimesAction(params: {
  occurrenceId: string;
  preferred_start_time: 'pdf' | 'form';
  preferred_end_time: 'pdf' | 'form';
}) {
  try {
    const supabase = getServiceSupabase();
    const { error } = await supabase
      .from('activity_occurrences')
      .update({
        preferred_start_time: params.preferred_start_time,
        preferred_end_time: params.preferred_end_time,
      })
      .eq('id', params.occurrenceId);

    if (error) {
      console.error('Error updating preferred times:', error);
      return { success: false as const, error: error.message };
    }

    return { success: true as const };
  } catch (err) {
    console.error(err);
    return { success: false as const, error: 'Internal Server Error' };
  }
}
