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

export interface ReporteCategoryEntry {
  category_id: string;
  participants: number;
}

export interface ReportePayload {
  data: string;
  activitat: string;
  hora_convocatoria: string;
  hora_finalitzacio: string;
  categories: ReporteCategoryEntry[];
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

      if (!act) {
        console.warn(`Activity "${actName}" not found, skipping`);
        continue;
      }

      const { data: existingOcc } = await supabase
        .from('activity_occurrences')
        .select('id')
        .eq('activity_id', act.id)
        .eq('activity_date', item.data)
        .maybeSingle();

      if (!existingOcc) {
        console.warn(`No occurrence for "${actName}" on ${item.data}, skipping`);
        continue;
      }

      const occurrenceId = existingOcc.id;

      const startTime = item.hora_convocatoria.length === 5
        ? `${item.hora_convocatoria}:00`
        : item.hora_convocatoria;
      const endTime = item.hora_finalitzacio.length === 5
        ? `${item.hora_finalitzacio}:00`
        : item.hora_finalitzacio;

      const { error: updateErr } = await supabase
        .from('activity_occurrences')
        .update({ form_start_time: startTime, form_end_time: endTime })
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

      const groupsToInsert = (item.categories || [])
        .filter(cat => cat.category_id && cat.participants > 0)
        .map(cat => ({
          occurrence_id: occurrenceId,
          category_id: cat.category_id,
          participants: cat.participants,
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
      .select('activities(name)')
      .eq('activity_date', date);

    if (error) {
      console.error('Error fetching daily activities:', error);
      return [];
    }

    const names = new Set<string>();
    data?.forEach(row => {
      const name = (row.activities as any)?.name;
      if (name) names.add(name);
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
    return data as { id: string; name: string }[];
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
