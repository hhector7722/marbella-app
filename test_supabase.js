const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function test() {
  console.time('fetch');
  const { data, error } = await supabase.from('purchase_invoices').select('*').limit(200);
  console.timeEnd('fetch');
  if (error) console.error(error);
  else console.log('Rows:', data?.length);
}
test();
