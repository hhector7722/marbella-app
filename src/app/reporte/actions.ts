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
  participants: string;
  categoria: string;
}

export async function submitReporteAction(activities: ReportePayload[]) {
  try {
    const supabase = getServiceSupabase();

    for (const item of activities) {
      if (!item.data || !item.activitat) continue;

      const actName = item.activitat.trim();

      // 1. Get or create activity
      let { data: act } = await supabase
        .from('activities')
        .select('id')
        .ilike('name', actName)
        .maybeSingle();

      let activityId: string | null = null;
      if (!act) {
        const { data: newAct, error: actErr } = await supabase
          .from('activities')
          .insert({ name: actName })
          .select('id')
          .single();
        if (!actErr && newAct) activityId = newAct.id;
      } else {
        activityId = act.id;
      }

      if (!activityId) continue;

      const participants = item.participants ? parseInt(item.participants, 10) : null;
      const category = item.categoria?.trim() || null;

      const hasHours = item.hora_convocatoria && item.hora_finalitzacio;

      if (hasHours) {
        // 2a. Insert a new occurrence with actual hours (source_type = 'web_form')
        //     so it appears alongside the planned occurrence for comparison.
        //     Also store participants + category directly on this occurrence.
        const startTime = item.hora_convocatoria.length === 5
          ? `${item.hora_convocatoria}:00`
          : item.hora_convocatoria;
        const endTime = item.hora_finalitzacio.length === 5
          ? `${item.hora_finalitzacio}:00`
          : item.hora_finalitzacio;

        const { data: occ, error: occErr } = await supabase
          .from('activity_occurrences')
          .insert({
            activity_id: activityId,
            activity_date: item.data,
            start_time: startTime,
            end_time: endTime,
            source_type: 'web_form',
            ...(participants !== null && !isNaN(participants) ? { participants } : {}),
            ...(category ? { category } : {}),
          })
          .select('id')
          .single();

        if (occErr) {
          console.error('Error inserting web_form occurrence:', occErr);
        }
      } else {
        // 2b. No hours provided → just update the existing planned occurrence(s)
        //     for this activity on this date with participants + category.
        if (participants !== null || category) {
          const updateData: Record<string, unknown> = {};
          if (participants !== null && !isNaN(participants)) updateData.participants = participants;
          if (category) updateData.category = category;

          if (Object.keys(updateData).length > 0) {
            const { error: updErr } = await supabase
              .from('activity_occurrences')
              .update(updateData)
              .eq('activity_id', activityId)
              .eq('activity_date', item.data)
              .neq('source_type', 'web_form'); // only update planned occurrences

            if (updErr) {
              console.error('Error updating planned occurrence:', updErr);
            }
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
      .select('activities(name)')
      .eq('activity_date', date);

    if (error) {
      console.error('Error fetching daily activities:', error);
      return [];
    }

    // Extract unique activity names
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

    // Count occurrences per activity
    const counts: Record<string, { count: number, name: string }> = {};
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
      // Fallback if is_active column doesn't exist yet
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
