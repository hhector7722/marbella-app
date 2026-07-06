const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
supabase.from('activity_occurrences').select('activity_date, start_time, end_time, form_start_time, form_end_time, preferred_start_time, preferred_end_time, total_participants, activities(name,color), activity_kinds(icon), occurrence_venues(venues(code,affects_bar)), occurrence_groups(participants,participant_categories(name))').limit(1).then(res => {
  console.log(JSON.stringify(res, null, 2));
  process.exit(0);
});
