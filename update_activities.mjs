import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing env vars');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase.rpc('execute_sql', {
    sql: `ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;`
  });

  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Success adding is_active column:', data);
  }
}

run();
