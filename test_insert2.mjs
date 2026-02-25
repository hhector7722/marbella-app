import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://feqjbwxkelpgzsdiphei.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZlcWpid3hrZWxwZ3pzZGlwaGVpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5Mzg1OTYsImV4cCI6MjA4MzUxNDU5Nn0._PztDeXP8DNGaPcheicFWvqwqG3GDfi2n_17WWawJSk'
);

async function test() {
  const { data: users } = await supabase.from('profiles').select('id').limit(1);
  const uid = users[0].id;

  const { data, error } = await supabase.from('time_logs').insert([
    {
      user_id: uid,
      clock_in: '2024-03-01T08:00:00.000Z',
      clock_out: '2024-03-01T16:00:00.000Z',
      total_hours: 8,
      event_type: 'baja'
    }
  ]);
  console.log('Insert Baja Error:', error?.message || 'Success');

  const { data: data2, error: error2 } = await supabase.from('time_logs').insert([
    {
      user_id: uid,
      clock_in: '2024-03-02T08:00:00.000Z',
      clock_out: '2024-03-02T16:00:00.000Z',
      total_hours: 8,
      event_type: 'regular'
    }
  ]);
  
  console.log('Insert Regular Error:', error2?.message || 'Success');
}

test();
