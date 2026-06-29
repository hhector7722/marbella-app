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
      if (!item.data || !item.activitat || !item.hora_convocatoria || !item.hora_finalitzacio) {
        continue; // Skip invalid entries
      }

      // 1. Get or create category
      let categoryId = null;
      if (item.categoria && item.categoria.trim() !== '') {
        const catName = item.categoria.trim();
        let { data: cat } = await supabase
          .from('participant_categories')
          .select('id')
          .ilike('name', catName)
          .maybeSingle();

        if (!cat) {
          const { data: newCat, error: catErr } = await supabase
            .from('participant_categories')
            .insert({ name: catName })
            .select('id')
            .single();
          
          if (!catErr && newCat) {
            categoryId = newCat.id;
          }
        } else {
          categoryId = cat.id;
        }
      }

      // 2. Get or create activity
      const actName = item.activitat.trim();
      let { data: act } = await supabase
        .from('activities')
        .select('id')
        .ilike('name', actName)
        .maybeSingle();

      let activityId = null;
      if (!act) {
        const { data: newAct, error: actErr } = await supabase
          .from('activities')
          .insert({ name: actName })
          .select('id')
          .single();
        
        if (!actErr && newAct) {
          activityId = newAct.id;
        }
      } else {
        activityId = act.id;
      }

      if (!activityId) continue;

      // 3. Create occurrence
      // Use source_type = 'web_form' to distinguish from 'pdf'
      const { data: occ, error: occErr } = await supabase
        .from('activity_occurrences')
        .insert({
          activity_id: activityId,
          activity_date: item.data,
          start_time: item.hora_convocatoria.length === 5 ? `${item.hora_convocatoria}:00` : item.hora_convocatoria,
          end_time: item.hora_finalitzacio.length === 5 ? `${item.hora_finalitzacio}:00` : item.hora_finalitzacio,
          source_type: 'web_form'
        })
        .select('id')
        .single();

      if (occErr || !occ) {
        console.error('Error inserting occurrence:', occErr);
        continue;
      }

      // 4. Create occurrence group
      if (categoryId) {
        const participantsCount = parseInt(item.participants, 10);
        await supabase
          .from('occurrence_groups')
          .insert({
            occurrence_id: occ.id,
            category_id: categoryId,
            participants: isNaN(participantsCount) ? null : participantsCount
          });
      }
    }

    return { success: true };
  } catch (error) {
    console.error('submitReporteAction error:', error);
    return { success: false, error: 'Internal Server Error' };
  }
}
