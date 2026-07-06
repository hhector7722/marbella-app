import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data, error } = await supabase
    .from('activity_occurrences')
    .select(`
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
    `)
    .limit(1);

  return NextResponse.json({ data, error });
}
