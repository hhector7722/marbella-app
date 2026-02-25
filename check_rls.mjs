import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://feqjbwxkelpgzsdiphei.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZlcWpid3hrZWxwZ3pzZGlwaGVpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5Mzg1OTYsImV4cCI6MjA4MzUxNDU5Nn0._PztDeXP8DNGaPcheicFWvqwqG3GDfi2n_17WWawJSk'
);

async function test() {
  const { data, error } = await supabase.rpc('get_policies_for_table', { table_name: 'time_logs' });
  if (error) {
     console.log('Cant use RPC... fallback to rest query on pg_policies?');
  } else {
     console.log(data);
  }
}

test();
