import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://feqjbwxkelpgzsdiphei.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZlcWpid3hrZWxwZ3pzZGlwaGVpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5Mzg1OTYsImV4cCI6MjA4MzUxNDU5Nn0._PztDeXP8DNGaPcheicFWvqwqG3GDfi2n_17WWawJSk'
);

async function test() {
  const { data, error } = await supabase.from('time_logs').insert([
    {
      user_id: '158e801b-90f6-4ee5-bab0-bdecc20f9eb1', // dummy o algun id existente
      clock_in: '2024-03-01T08:00:00.000Z',
      clock_out: '2024-03-01T16:00:00.000Z',
      total_hours: 8,
      event_type: 'baja'
    }
  ]);
  console.log('Error:', error);
  console.log('Data:', data);
}

test();
