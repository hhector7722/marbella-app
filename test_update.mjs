import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://feqjbwxkelpgzsdiphei.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZlcWpid3hrZWxwZ3pzZGlwaGVpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5Mzg1OTYsImV4cCI6MjA4MzUxNDU5Nn0._PztDeXP8DNGaPcheicFWvqwqG3GDfi2n_17WWawJSk'
);

async function test() {
  const { data: logs } = await supabase.from('time_logs').select('id, user_id').limit(1);
  const logId = logs[0].id;

  const { data: data2, error: error2 } = await supabase.from('time_logs').update(
    {
      event_type: 'baja'
    }
  ).eq('id', logId);
  
  console.log('Update a Baja Error:', error2?.message || 'Success');
}

test();
